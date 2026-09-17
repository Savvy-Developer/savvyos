import express from "express";
import multer from "multer";
import { nanoid } from "nanoid";
import { storagePut } from "./storage";
import { getDb } from "./db";
import { chatMessageAttachments, documents, eventExpenses, eventPortfolio, userProfiles } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { sdk } from "./_core/sdk";
import { invokeLLM } from "./_core/llm";
import { canAdminUsePermission } from "./routers/permissions";
import { agentOwnsProperty } from "./routers/website";
import { authorizeChatAttachmentUpload } from "./routers/chat";
import pdfParse from "./lib/pdf-parse-safe";
import { categorizeExpenseInvoice } from "./eventsExpenseIntake";
import { recalculateEventCommittedExpense } from "./eventsFinancials";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });

const eventInvoiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/jpeg", "image/png", "image/webp", "text/plain"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Upload a PDF, DOC, DOCX, TXT, JPG, PNG, or WEBP invoice."));
  },
});

// Headshot upload: 2MB limit, images only
const landingPageImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPG, PNG, and WEBP images are allowed"));
  },
});

const headshotUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG, and WEBP images are allowed"));
    }
  },
});

// Chat permits common work documents and images, but deliberately rejects
// executable/archive types. The server, not the browser, owns the S3 key.
const chatAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
      "text/csv",
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Chat accepts PDFs, Office files, CSV or text files, and JPG, PNG, WEBP, or GIF images."));
  },
});

/**
 * Who may upload public-site media.
 *
 * Mirrors the gate the website router already applies to the matching save:
 * admins go through the Website Studio permission, and an agent may upload
 * for a property they own or for their own website profile. Without the
 * agent half an agent can fill in a listing they are allowed to publish but
 * cannot add its photos.
 */
async function canUploadWebsiteImage(user: any, rawPropertyId: unknown): Promise<boolean> {
  if (!user || user.isActive === false) return false;
  if (user.role === "admin") return canAdminUsePermission(user, "canViewWebsite");
  if (user.role !== "agent") return false;
  // No property on the form means the agent's own profile photo.
  if (rawPropertyId === undefined || rawPropertyId === null || rawPropertyId === "") return true;
  const propertyId = Number(rawPropertyId);
  if (!Number.isInteger(propertyId) || propertyId <= 0) return false;
  const db = await getDb();
  if (!db) return false;
  return agentOwnsProperty(db, user.id, propertyId);
}

export function registerUploadRoutes(app: express.Application) {
  // POST /api/chat/attachments/upload — staged attachment for an authorized
  // participant. The tRPC send mutation links the staged record atomically to
  // the eventual message, so a user cannot attach a file to another channel.
  app.post("/api/chat/attachments/upload", chatAttachmentUpload.single("file"), async (req: any, res: any) => {
    try {
      let user: any = null;
      try { user = await sdk.authenticateRequest(req); } catch { user = null; }
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      if (!req.file) return res.status(400).json({ error: "No file provided" });
      const channelId = Number(req.body?.channelId);
      if (!Number.isInteger(channelId) || channelId <= 0) {
        return res.status(400).json({ error: "A valid Chat conversation is required" });
      }
      const state = await authorizeChatAttachmentUpload(user, channelId);
      const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180) || "attachment";
      const fileKey = `chat/${channelId}/${user.id}/${nanoid(14)}-${safeName}`;
      const { url } = await storagePut(fileKey, req.file.buffer, req.file.mimetype);
      const [result] = await state.db.insert(chatMessageAttachments).values({
        channelId,
        uploadedById: user.id,
        fileName: req.file.originalname.slice(0, 255),
        fileUrl: url,
        fileKey,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
      });
      return res.json({
        id: Number(result.insertId),
        fileName: req.file.originalname.slice(0, 255),
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
      });
    } catch (err: any) {
      const status = err?.code === "FORBIDDEN" ? 403 : err?.code === "NOT_FOUND" ? 404 : 500;
      console.error("[ChatAttachmentUpload] Error:", err?.message ?? err);
      return res.status(status).json({ error: err?.message ?? "Upload failed" });
    }
  });

  // POST /api/upload/website-image — public-site media, restricted by the
  // opt-in Website permissions used by the CMS.
  app.post("/api/upload/website-image", landingPageImageUpload.single("file"), async (req: any, res: any) => {
    try {
      let user: any = null;
      try { user = await sdk.authenticateRequest(req); } catch { user = null; }
      if (!(await canUploadWebsiteImage(user, req.body?.propertyId))) return res.status(403).json({ error: "You can only upload images for your own listings or profile." });
      if (!req.file) return res.status(400).json({ error: "No image provided" });
      const ext = req.file.mimetype === "image/png" ? "png" : req.file.mimetype === "image/webp" ? "webp" : "jpg";
      const fileKey = `website/${user.id}/${nanoid(12)}.${ext}`;
      const { url } = await storagePut(fileKey, req.file.buffer, req.file.mimetype);
      return res.json({ url, fileKey, mimeType: req.file.mimetype, fileSize: req.file.size });
    } catch (err: any) {
      console.error("[WebsiteImageUpload] Error:", err);
      return res.status(500).json({ error: err.message ?? "Upload failed" });
    }
  });

  // POST /api/upload/landing-page-image — optimized public-page media stored in S3.
  app.post("/api/upload/landing-page-image", landingPageImageUpload.single("file"), async (req: any, res: any) => {
    try {
      let user: any = null;
      try { user = await sdk.authenticateRequest(req); } catch { user = null; }
      if (!user || !(await canAdminUsePermission(user, "canEditLandingPages"))) return res.status(403).json({ error: "Landing Pages edit permission is required" });
      if (!req.file) return res.status(400).json({ error: "No image provided" });
      const ext = req.file.mimetype === "image/png" ? "png" : req.file.mimetype === "image/webp" ? "webp" : "jpg";
      const fileKey = `landing-pages/${user.id}/${nanoid(12)}.${ext}`;
      const { url } = await storagePut(fileKey, req.file.buffer, req.file.mimetype);
      return res.json({ url, fileKey, mimeType: req.file.mimetype, fileSize: req.file.size });
    } catch (err: any) {
      console.error("[LandingPageImageUpload] Error:", err);
      return res.status(500).json({ error: err.message ?? "Upload failed" });
    }
  });

  // POST /api/documents/upload — multipart file upload
  app.post("/api/documents/upload", upload.single("file"), async (req: any, res: any) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file provided" });
      const fileKey = req.body.fileKey ?? `documents/${nanoid(8)}-${req.file.originalname}`;
      const { url } = await storagePut(fileKey, req.file.buffer, req.file.mimetype);
      return res.json({ url, fileKey });
    } catch (err: any) {
      console.error("[Upload] Error:", err);
      return res.status(500).json({ error: err.message ?? "Upload failed" });
    }
  });

  // POST /api/events/upload-invoice — stores an invoice and creates its event expense.
  app.post("/api/events/upload-invoice", eventInvoiceUpload.single("file"), async (req: any, res: any) => {
    try {
      let user: any = null;
      try { user = await sdk.authenticateRequest(req); } catch { user = null; }
      if (!user || !(await canAdminUsePermission(user, "canViewEvents"))) return res.status(403).json({ error: "Events permission is required" });
      if (!req.file) return res.status(400).json({ error: "No invoice file provided" });
      const eventId = Number(req.body?.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) return res.status(400).json({ error: "A valid event is required" });
      const db = await getDb();
      if (!db) return res.status(500).json({ error: "Database unavailable" });
      const [event] = await db.select({ id: eventPortfolio.id }).from(eventPortfolio).where(eq(eventPortfolio.id, eventId)).limit(1);
      if (!event) return res.status(404).json({ error: "Event not found" });
      let extractedText = "";
      if (req.file.mimetype === "application/pdf") {
        try { extractedText = (await pdfParse(req.file.buffer)).text.slice(0, 20_000); }
        catch (error) { console.warn("[EventInvoiceUpload] PDF text extraction failed:", error); }
      } else if (req.file.mimetype === "text/plain") extractedText = req.file.buffer.toString("utf8").slice(0, 20_000);
      const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      const fileKey = `event-invoices/${eventId}/${nanoid(12)}-${safeName}`;
      const { url } = await storagePut(fileKey, req.file.buffer, req.file.mimetype);
      const suggestion = categorizeExpenseInvoice(req.file.originalname, extractedText);
      const [result] = await db.insert(eventExpenses).values({
        eventId, expenseDate: suggestion.expenseDate ? new Date(`${suggestion.expenseDate}T12:00:00.000Z`) : null,
        vendorName: suggestion.vendorName, description: suggestion.description, category: suggestion.category,
        amount: suggestion.amount === null ? null : String(suggestion.amount), status: "invoiced",
        invoiceFileName: req.file.originalname, invoiceFileUrl: url, invoiceFileKey: fileKey,
        invoiceMimeType: req.file.mimetype, categorizationNote: suggestion.categorizationNote,
      });
      await recalculateEventCommittedExpense(db, eventId);
      return res.json({ expense: { id: Number(result.insertId), eventId, ...suggestion, status: "invoiced", invoiceFileName: req.file.originalname, invoiceFileUrl: url, invoiceFileKey: fileKey, invoiceMimeType: req.file.mimetype, version: 1 } });
    } catch (err: any) {
      console.error("[EventInvoiceUpload] Error:", err);
      return res.status(500).json({ error: err.message ?? "Invoice upload failed" });
    }
  });

  // POST /api/upload/referral-document — outbound referral agreement and payment-proof upload
  app.post("/api/upload/referral-document", upload.single("file"), async (req: any, res: any) => {
    try {
      let user: any = null;
      try { user = await sdk.authenticateRequest(req); } catch { user = null; }
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      if (!req.file) return res.status(400).json({ error: "No file provided" });
      const allowed = [
        "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "image/jpeg", "image/png", "image/webp", "text/plain",
      ];
      if (!allowed.includes(req.file.mimetype)) return res.status(400).json({ error: "Unsupported document type" });
      const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      const fileKey = `referral-documents/${user.id}/${nanoid(12)}-${safeName}`;
      const { url } = await storagePut(fileKey, req.file.buffer, req.file.mimetype);
      return res.json({ fileUrl: url, fileKey, fileName: req.file.originalname, mimeType: req.file.mimetype, fileSize: req.file.size });
    } catch (err: any) {
      console.error("[ReferralDocumentUpload] Error:", err);
      return res.status(500).json({ error: err.message ?? "Upload failed" });
    }
  });

  // POST /api/upload/agent-renewal-agreement — renewal meeting agreement upload
  app.post("/api/upload/agent-renewal-agreement", upload.single("file"), async (req: any, res: any) => {
    try {
      let user: any = null;
      try { user = await sdk.authenticateRequest(req); } catch { user = null; }
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      if (!(await canAdminUsePermission(user, "canViewAgentRenewals"))) return res.status(403).json({ error: "Agent Renewals permission is required" });
      if (!req.file) return res.status(400).json({ error: "No file provided" });
      const allowed = [
        "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/jpeg", "image/png", "image/webp", "text/plain",
      ];
      if (!allowed.includes(req.file.mimetype)) return res.status(400).json({ error: "Unsupported document type" });
      const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      const fileKey = `agent-renewal-agreements/${user.id}/${nanoid(12)}-${safeName}`;
      const { url } = await storagePut(fileKey, req.file.buffer, req.file.mimetype);
      return res.json({ fileUrl: url, fileKey, fileName: req.file.originalname, mimeType: req.file.mimetype, fileSize: req.file.size });
    } catch (err: any) {
      console.error("[AgentRenewalAgreementUpload] Error:", err);
      return res.status(500).json({ error: err.message ?? "Upload failed" });
    }
  });

  // POST /api/upload/transaction-document — transaction document upload
  app.post("/api/upload/transaction-document", upload.single("file"), async (req: any, res: any) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file provided" });
      const fileKey = `transaction-docs/${nanoid(12)}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { url } = await storagePut(fileKey, req.file.buffer, req.file.mimetype);
      return res.json({ fileUrl: url, fileKey });
    } catch (err: any) {
      console.error("[TransactionDocUpload] Error:", err);
      return res.status(500).json({ error: err.message ?? "Upload failed" });
    }
  });

  // POST /api/upload/transaction-documents-bulk — multi-file transaction document upload
  app.post("/api/upload/transaction-documents-bulk", upload.array("files", 20), async (req: any, res: any) => {
    try {
      const files: Express.Multer.File[] = req.files ?? [];
      if (!files.length) return res.status(400).json({ error: "No files provided" });
      const results: Array<{ originalName: string; fileUrl: string; fileKey: string; mimeType: string; fileSize: number }> = [];
      for (const file of files) {
        const fileKey = `transaction-docs/${nanoid(12)}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { url } = await storagePut(fileKey, file.buffer, file.mimetype);
        results.push({ originalName: file.originalname, fileUrl: url, fileKey, mimeType: file.mimetype, fileSize: file.size });
      }
      return res.json({ files: results });
    } catch (err: any) {
      console.error("[BulkTransactionDocUpload] Error:", err);
      return res.status(500).json({ error: err.message ?? "Upload failed" });
    }
  });

  // POST /api/upload/listing-document — listing document upload
  app.post("/api/upload/listing-document", upload.single("file"), async (req: any, res: any) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file provided" });
      const fileKey = `listing-docs/${nanoid(12)}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { url } = await storagePut(fileKey, req.file.buffer, req.file.mimetype);
      return res.json({ fileUrl: url, fileKey });
    } catch (err: any) {
      console.error("[ListingDocUpload] Error:", err);
      return res.status(500).json({ error: err.message ?? "Upload failed" });
    }
  });

  // POST /api/upload/listing-documents-bulk — multi-file listing document upload
  app.post("/api/upload/listing-documents-bulk", upload.array("files", 20), async (req: any, res: any) => {
    try {
      const files: Express.Multer.File[] = req.files ?? [];
      if (!files.length) return res.status(400).json({ error: "No files provided" });
      const results: Array<{ originalName: string; fileUrl: string; fileKey: string; mimeType: string; fileSize: number }> = [];
      for (const file of files) {
        const fileKey = `listing-docs/${nanoid(12)}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { url } = await storagePut(fileKey, file.buffer, file.mimetype);
        results.push({ originalName: file.originalname, fileUrl: url, fileKey, mimeType: file.mimetype, fileSize: file.size });
      }
      return res.json({ files: results });
    } catch (err: any) {
      console.error("[BulkListingDocUpload] Error:", err);
      return res.status(500).json({ error: err.message ?? "Upload failed" });
    }
  });

  // POST /api/upload/lead-source-agreement — sub-source agreement upload
  app.post("/api/upload/lead-source-agreement", upload.single("file"), async (req: any, res: any) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file provided" });
      const fileKey = `lead-source-agreements/${nanoid(12)}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { url } = await storagePut(fileKey, req.file.buffer, req.file.mimetype);
      return res.json({ url, fileKey });
    } catch (err: any) {
      console.error("[LeadSourceAgreementUpload] Error:", err);
      return res.status(500).json({ error: err.message ?? "Upload failed" });
    }
  });

  // POST /api/voice/upload — voice note upload + transcription trigger
  app.post("/api/voice/upload", upload.single("audio"), async (req: any, res: any) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No audio file provided" });
      const fileKey = `voice/${nanoid(8)}-${req.file.originalname}`;
      const { url } = await storagePut(fileKey, req.file.buffer, req.file.mimetype);
      return res.json({ url, fileKey });
    } catch (err: any) {
      console.error("[VoiceUpload] Error:", err);
      return res.status(500).json({ error: err.message ?? "Upload failed" });
    }
  });

  // POST /api/upload/headshot — user profile photo (2MB, images only)
  // Optional body field: targetUserId (admin only) to upload on behalf of another user
  app.post("/api/upload/headshot", headshotUpload.single("file"), async (req: any, res: any) => {
    try {
      // Authenticate the request
      let user: any = null;
      try { user = await sdk.authenticateRequest(req); } catch { user = null; }
      if (!user) return res.status(401).json({ error: "Unauthorized" });

      if (!req.file) return res.status(400).json({ error: "No file provided" });

      // Admins can upload on behalf of another user by passing targetUserId
      let targetUserId = user.id;
      if (req.body?.targetUserId) {
        if (user.role !== "admin") return res.status(403).json({ error: "Only admins can upload on behalf of other users" });
        targetUserId = Number(req.body.targetUserId);
        if (isNaN(targetUserId)) return res.status(400).json({ error: "Invalid targetUserId" });
      }

      const ext =
        req.file.mimetype === "image/png" ? "png"
        : req.file.mimetype === "image/webp" ? "webp"
        : "jpg";
      const fileKey = `headshots/${targetUserId}_${nanoid(8)}.${ext}`;
      const { url } = await storagePut(fileKey, req.file.buffer, req.file.mimetype);

      // Upsert profilePhotoUrl in user_profiles
      const db = await getDb();
      if (db) {
        const existing = await db
          .select({ id: userProfiles.id })
          .from(userProfiles)
          .where(eq(userProfiles.userId, targetUserId))
          .limit(1);
        if (existing.length > 0) {
          await db.update(userProfiles).set({ profilePhotoUrl: url }).where(eq(userProfiles.userId, targetUserId));
        } else {
          await db.insert(userProfiles).values({ userId: targetUserId, profilePhotoUrl: url });
        }
      }

      return res.json({ url });
    } catch (err: any) {
      console.error("[HeadshotUpload] Error:", err);
      return res.status(500).json({ error: err.message ?? "Upload failed" });
    }
  });

  // POST /api/upload/backgroundless-headshot — transparent-background portrait for automatic graphics.
  // Optional body field: targetUserId (admin only) to upload on behalf of another user.
  app.post("/api/upload/backgroundless-headshot", headshotUpload.single("file"), async (req: any, res: any) => {
    try {
      let user: any = null;
      try { user = await sdk.authenticateRequest(req); } catch { user = null; }
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      if (!req.file) return res.status(400).json({ error: "No file provided" });

      let targetUserId = user.id;
      if (req.body?.targetUserId) {
        if (user.role !== "admin") return res.status(403).json({ error: "Only admins can upload on behalf of other users" });
        targetUserId = Number(req.body.targetUserId);
        if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
          return res.status(400).json({ error: "Invalid targetUserId" });
        }
      }

      const ext = req.file.mimetype === "image/png" ? "png" : req.file.mimetype === "image/webp" ? "webp" : "jpg";
      const fileKey = `backgroundless-headshots/${targetUserId}_${nanoid(8)}.${ext}`;
      const { url } = await storagePut(fileKey, req.file.buffer, req.file.mimetype);

      const db = await getDb();
      if (!db) return res.status(500).json({ error: "Database unavailable" });
      const existing = await db
        .select({ id: userProfiles.id })
        .from(userProfiles)
        .where(eq(userProfiles.userId, targetUserId))
        .limit(1);
      if (existing.length > 0) {
        await db
          .update(userProfiles)
          .set({ backgroundlessHeadshotUrl: url })
          .where(eq(userProfiles.userId, targetUserId));
      } else {
        await db.insert(userProfiles).values({ userId: targetUserId, backgroundlessHeadshotUrl: url });
      }

      return res.json({ url });
    } catch (err: any) {
      console.error("[BackgroundlessHeadshotUpload] Error:", err);
      return res.status(500).json({ error: err.message ?? "Upload failed" });
    }
  });

  // POST /api/upload/resume — public resume upload for job applicants (no auth)
  const resumeUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (_req, file, cb) => {
      const allowed = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Only PDF, DOC, DOCX, and TXT files are allowed"));
      }
    },
  });
  app.post("/api/upload/resume", resumeUpload.single("file"), async (req: any, res: any) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file provided" });
      const fileKey = `resumes/${nanoid(12)}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { url } = await storagePut(fileKey, req.file.buffer, req.file.mimetype);
      return res.json({ url, fileKey, fileName: req.file.originalname });
    } catch (err: any) {
      console.error("[ResumeUpload] Error:", err);
      return res.status(500).json({ error: err.message ?? "Upload failed" });
    }
  });

  // POST /api/upload/coaching-assessment — assessment file upload (PDF, DOC, DOCX, TXT, images)
  const assessmentUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 16 * 1024 * 1024 },
    fileFilter: (_req: any, file: any, cb: any) => {
      const allowed = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
        "image/png",
        "image/jpeg",
        "image/webp",
      ];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Only PDF, DOC, DOCX, TXT, and image files are allowed"));
      }
    },
  });
  app.post("/api/upload/coaching-assessment", assessmentUpload.single("file"), async (req: any, res: any) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file provided" });
      const fileKey = `coaching-assessments/${nanoid(12)}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { url } = await storagePut(fileKey, req.file.buffer, req.file.mimetype);
      return res.json({ fileUrl: url, fileKey, fileName: req.file.originalname, mimeType: req.file.mimetype });
    } catch (err: any) {
      console.error("[CoachingAssessmentUpload] Error:", err);
      return res.status(500).json({ error: err.message ?? "Upload failed" });
    }
  });

  // POST /api/upload/analyze-application — Upload resume + cover letter, analyze with AI
  const applicationUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req: any, file: any, cb: any) => {
      const allowed = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Only PDF, DOC, DOCX, and TXT files are allowed"));
      }
    },
  });

  app.post("/api/upload/analyze-application", applicationUpload.fields([
    { name: "resume", maxCount: 1 },
    { name: "coverLetter", maxCount: 1 },
  ]), async (req: any, res: any) => {
    try {
      const files = req.files as Record<string, Express.Multer.File[]>;
      const linkedinUrl = req.body?.linkedinUrl || "";
      const jobTitle = req.body?.jobTitle || "";
      const jobDescription = req.body?.jobDescription || "";
      const jobRequirements = req.body?.jobRequirements || "";

      let resumeUrl = "";
      let resumeFileName = "";
      let resumeText = "";
      let coverLetterUrl = "";
      let coverLetterFileName = "";
      let coverLetterText = "";

      // Upload and extract resume
      if (files?.resume?.[0]) {
        const file = files.resume[0];
        const fileKey = `resumes/${nanoid(12)}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const result = await storagePut(fileKey, file.buffer, file.mimetype);
        resumeUrl = result.url;
        resumeFileName = file.originalname;
        // Extract text from PDF
        if (file.mimetype === "application/pdf") {
          try {
            const parsed = await pdfParse(file.buffer);
            resumeText = parsed.text.slice(0, 15000);
          } catch (e) {
            console.error("[AnalyzeApp] PDF parse error:", e);
          }
        } else if (file.mimetype === "text/plain") {
          resumeText = file.buffer.toString("utf-8").slice(0, 15000);
        }
      }

      // Upload and extract cover letter
      if (files?.coverLetter?.[0]) {
        const file = files.coverLetter[0];
        const fileKey = `cover-letters/${nanoid(12)}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const result = await storagePut(fileKey, file.buffer, file.mimetype);
        coverLetterUrl = result.url;
        coverLetterFileName = file.originalname;
        if (file.mimetype === "application/pdf") {
          try {
            const parsed = await pdfParse(file.buffer);
            coverLetterText = parsed.text.slice(0, 8000);
          } catch (e) {
            console.error("[AnalyzeApp] Cover letter PDF parse error:", e);
          }
        } else if (file.mimetype === "text/plain") {
          coverLetterText = file.buffer.toString("utf-8").slice(0, 8000);
        }
      }

      // If no text extracted, return just the upload URLs
      if (!resumeText && !coverLetterText && !linkedinUrl) {
        return res.json({
          resumeUrl, resumeFileName, coverLetterUrl, coverLetterFileName,
          extracted: null,
          message: "Files uploaded but no text could be extracted for analysis.",
        });
      }

      // Use AI to extract structured data
      const prompt = `You are an expert HR data extraction system. Analyze the following candidate materials and extract structured information.

Job being applied for: ${jobTitle}
Job Description: ${jobDescription}
Job Requirements: ${jobRequirements}

--- RESUME TEXT ---
${resumeText || "(No resume text available)"}

--- COVER LETTER TEXT ---
${coverLetterText || "(No cover letter text available)"}

--- LINKEDIN URL ---
${linkedinUrl || "(Not provided)"}

Extract the following information from the materials. If a field cannot be determined, use null. Return ONLY valid JSON with no markdown formatting:
{
  "phone": "phone number if found",
  "city": "city if found",
  "state": "state abbreviation if found",
  "linkedinUrl": "${linkedinUrl || "linkedin URL if found in resume"}",
  "portfolioUrl": "portfolio/website URL if found",
  "workHistory": [
    {
      "company": "company name",
      "title": "job title",
      "startDate": "YYYY-MM format",
      "endDate": "YYYY-MM format or empty if current",
      "isCurrent": true/false,
      "description": "brief description of role/responsibilities"
    }
  ],
  "education": [
    {
      "institution": "school name",
      "degree": "degree type",
      "fieldOfStudy": "major/field",
      "startYear": "YYYY",
      "endYear": "YYYY",
      "gpa": "GPA if mentioned"
    }
  ],
  "coverLetter": "the full cover letter text (from the cover letter document, or from the resume if it contains one)",
  "whyInterested": "extract any statement about why they want this role, or null",
  "salaryExpectation": "salary expectation if mentioned, or null",
  "availableStartDate": "start date if mentioned, or null",
  "skills": ["list of key skills mentioned"]
}`;

      const response = await invokeLLM({
        messages: [{ role: "user", content: prompt }],
        model: "gpt-5-mini",
        maxTokens: 4096,
      });

      let extracted: any = null;
      const rawContent = response.choices?.[0]?.message?.content;
      if (typeof rawContent === "string") {
        try {
          // Strip markdown code fences if present
          const cleaned = rawContent.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
          extracted = JSON.parse(cleaned);
        } catch (e) {
          console.error("[AnalyzeApp] JSON parse error:", e);
          extracted = null;
        }
      }

      return res.json({
        resumeUrl,
        resumeFileName,
        coverLetterUrl,
        coverLetterFileName,
        extracted,
      });
    } catch (err: any) {
      console.error("[AnalyzeApplication] Error:", err);
      return res.status(500).json({ error: err.message ?? "Analysis failed" });
    }
  });
}

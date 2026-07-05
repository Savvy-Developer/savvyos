import express from "express";
import multer from "multer";
import { nanoid } from "nanoid";
import { storagePut } from "./storage";
import { getDb } from "./db";
import { documents, userProfiles } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { sdk } from "./_core/sdk";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });

// Headshot upload: 2MB limit, images only
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

export function registerUploadRoutes(app: express.Application) {
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
  app.post("/api/upload/headshot", headshotUpload.single("file"), async (req: any, res: any) => {
    try {
      // Authenticate the request
      let user: any = null;
      try { user = await sdk.authenticateRequest(req); } catch { user = null; }
      if (!user) return res.status(401).json({ error: "Unauthorized" });

      if (!req.file) return res.status(400).json({ error: "No file provided" });

      const ext =
        req.file.mimetype === "image/png" ? "png"
        : req.file.mimetype === "image/webp" ? "webp"
        : "jpg";
      const fileKey = `headshots/${user.id}_${nanoid(8)}.${ext}`;
      const { url } = await storagePut(fileKey, req.file.buffer, req.file.mimetype);

      // Upsert profilePhotoUrl in user_profiles
      const db = await getDb();
      if (db) {
        const existing = await db
          .select({ id: userProfiles.id })
          .from(userProfiles)
          .where(eq(userProfiles.userId, user.id))
          .limit(1);
        if (existing.length > 0) {
          await db.update(userProfiles).set({ profilePhotoUrl: url }).where(eq(userProfiles.userId, user.id));
        } else {
          await db.insert(userProfiles).values({ userId: user.id, profilePhotoUrl: url });
        }
      }

      return res.json({ url });
    } catch (err: any) {
      console.error("[HeadshotUpload] Error:", err);
      return res.status(500).json({ error: err.message ?? "Upload failed" });
    }
  });
}

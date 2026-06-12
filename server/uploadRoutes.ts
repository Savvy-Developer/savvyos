import express from "express";
import multer from "multer";
import { nanoid } from "nanoid";
import { storagePut } from "./storage";
import { getDb } from "./db";
import { documents } from "../drizzle/schema";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });

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
}

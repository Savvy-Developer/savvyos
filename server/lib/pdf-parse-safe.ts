/**
 * Safe wrapper around pdf-parse that avoids the known bug in v1.1.1
 * where the module tries to read a test PDF file when `module.parent` is falsy
 * (which happens in ESM/bundled environments).
 *
 * Instead of importing the top-level index.js, we import the actual
 * parsing library directly from pdf-parse/lib/pdf-parse.js.
 */

// @ts-ignore - importing internal module path
import pdfParseFn from "pdf-parse/lib/pdf-parse.js";

export default pdfParseFn as (
  dataBuffer: Buffer,
  options?: Record<string, unknown>
) => Promise<{ numpages: number; numrender: number; info: unknown; metadata: unknown; text: string; version: string }>;

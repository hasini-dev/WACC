// Server/worker only. PDF validation, text-layer extraction with OCR fallback, normalization.
import { createHash } from "node:crypto";
import path from "node:path";
import type { ExtractionMethod } from "@/types/applicant";

export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_PAGES = 15;
/** Pages with fewer meaningful characters than this are rasterized and OCR'd. */
export const MIN_PAGE_CHARS = 40;

export type PdfErrorCode = "NOT_PDF" | "ENCRYPTED" | "CORRUPT" | "EMPTY" | "TOO_LARGE" | "TOO_MANY_PAGES" | "OCR_LOW_CONFIDENCE";

export class PdfError extends Error {
  constructor(
    public readonly code: PdfErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PdfError";
  }
}

export interface ParsedPdf {
  text: string;
  pages: string[];
  pageCount: number;
  method: ExtractionMethod;
  ocrPages: number[];
  /** Mean OCR confidence (0–100) across OCR'd pages; null when no OCR was needed. */
  ocrConfidence: number | null;
}

export function sha256(buf: Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Real PDFs start with "%PDF-" (allow a little leading junk, as readers do). */
export function isPdf(buf: Uint8Array): boolean {
  const head = Buffer.from(buf.subarray(0, 1024)).toString("latin1");
  return head.includes("%PDF-");
}

export function validatePdfBytes(buf: Uint8Array): void {
  if (buf.byteLength > MAX_BYTES) throw new PdfError("TOO_LARGE", `File is ${(buf.byteLength / 1e6).toFixed(1)} MB; limit is 10 MB`);
  if (!isPdf(buf)) throw new PdfError("NOT_PDF", "Not a PDF (missing %PDF header)");
}

const meaningful = (s: string) => s.replace(/[^A-Za-z0-9]/g, "").length;

/**
 * Normalize extracted text: rejoin hyphenated line breaks, collapse whitespace,
 * drop lines repeated on most pages (headers/footers), keep bullet characters.
 */
export function normalizeText(pages: string[]): string {
  const lineCounts = new Map<string, number>();
  const pageLines = pages.map((p) =>
    p
      .replace(/\r\n?/g, "\n")
      // Rejoin hyphenated line breaks first, so a continuation line can't be mistaken for a repeated footer.
      .replace(/([A-Za-z])-\n[ \t]*([a-z])/g, "$1$2")
      .split("\n")
      .map((l) => l.replace(/[ \t ]+/g, " ").trim()),
  );
  if (pages.length >= 3) {
    for (const lines of pageLines) for (const l of new Set(lines)) if (l) lineCounts.set(l, (lineCounts.get(l) ?? 0) + 1);
  }
  const repeated = new Set([...lineCounts].filter(([, n]) => n >= Math.ceil(pages.length * 0.6)).map(([l]) => l));
  const joined = pageLines
    .map((lines) => lines.filter((l) => !repeated.has(l) && !/^page \d+( of \d+)?$/i.test(l)).join("\n"))
    .join("\n\n");
  return joined
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[•●▪◦‣∙·*–-]\s*/gm, "• ") // unify bullet characters
    .trim();
}

async function loadPdf(buf: Uint8Array) {
  const { getDocumentProxy } = await import("unpdf");
  try {
    return await getDocumentProxy(new Uint8Array(buf));
  } catch (err) {
    const name = (err as { name?: string }).name ?? "";
    const msg = (err as Error).message ?? String(err);
    if (name === "PasswordException" || /password/i.test(msg)) throw new PdfError("ENCRYPTED", "PDF is password-protected");
    throw new PdfError("CORRUPT", `Could not read PDF: ${msg.slice(0, 120)}`);
  }
}

async function ocrPage(buf: Uint8Array, pageNumber: number): Promise<{ text: string; confidence: number }> {
  const [{ renderPageAsImage }, { createWorker }] = await Promise.all([import("unpdf"), import("tesseract.js")]);
  const png = await renderPageAsImage(new Uint8Array(buf), pageNumber, { canvasImport: () => import("@napi-rs/canvas"), scale: 2 });
  const worker = await createWorker("eng", undefined, { cachePath: path.join(process.cwd(), ".data", "tesseract") });
  try {
    const { data } = await worker.recognize(Buffer.from(png));
    return { text: data.text, confidence: data.confidence };
  } finally {
    await worker.terminate();
  }
}

export async function parsePdf(buf: Uint8Array): Promise<ParsedPdf> {
  validatePdfBytes(buf);
  const pdf = await loadPdf(buf);
  const pageCount = pdf.numPages;
  if (pageCount > MAX_PAGES) throw new PdfError("TOO_MANY_PAGES", `PDF has ${pageCount} pages; limit is ${MAX_PAGES}`);

  const { extractText } = await import("unpdf");
  let layer: string[];
  try {
    layer = (await extractText(pdf, { mergePages: false })).text;
  } catch (err) {
    throw new PdfError("CORRUPT", `Could not read text: ${(err as Error).message.slice(0, 120)}`);
  }

  const pages: string[] = [];
  const ocrPages: number[] = [];
  const confidences: number[] = [];
  for (let i = 0; i < pageCount; i++) {
    const text = layer[i] ?? "";
    if (meaningful(text) >= MIN_PAGE_CHARS) {
      pages.push(text);
      continue;
    }
    const ocr = await ocrPage(buf, i + 1);
    ocrPages.push(i + 1);
    confidences.push(ocr.confidence);
    pages.push(meaningful(ocr.text) > meaningful(text) ? ocr.text : text);
  }

  const text = normalizeText(pages);
  if (meaningful(text) === 0) throw new PdfError("EMPTY", "No readable text in PDF");
  const method: ExtractionMethod = ocrPages.length === 0 ? "text" : ocrPages.length === pageCount ? "ocr" : "mixed";
  const ocrConfidence = confidences.length ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length) : null;
  return { text, pages, pageCount, method, ocrPages, ocrConfidence };
}

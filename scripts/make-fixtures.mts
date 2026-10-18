// Generate a local stand-in for the resume bucket: one folder per job.
//   14 text resumes (from the Phase 1 mock applicants), 2 scanned (image-only) PDFs,
//   1 two-column layout, 1 corrupt file, 1 exact duplicate.
// Usage: npm run fixtures   → tests/fixtures/bucket/
import { mkdir, rm, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { APPLICANTS, APPLICATIONS_BY_ID } from "../src/lib/mock-data";

const ROOT = path.join(process.cwd(), "tests", "fixtures", "bucket");
const FOLDER: Record<string, string> = {
  "job-backend-java": "backend-engineer",
  "job-data-people": "data-analyst",
  "job-ux-designer": "ux-designer",
};

// StandardFonts only cover WinAnsi; replace anything outside it.
const winAnsi = (s: string) => s.replace(/→/g, "->").replace(/[^\n\x20-\x7e -ÿ•–—·’“”]/g, "");

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (!para.trim()) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

async function textPdf(text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = doc.addPage([612, 792]);
  let y = 740;
  for (const [i, line] of wrap(winAnsi(text), font, 10.5, 500).entries()) {
    if (y < 60) {
      page = doc.addPage([612, 792]);
      y = 740;
    }
    const isHeading = /^[A-Z ]{4,}$/.test(line.trim());
    const f = i === 0 || isHeading ? bold : font;
    page.drawText(line, { x: 56, y, size: i === 0 ? 18 : 10.5, font: f, color: rgb(0.1, 0.1, 0.1) });
    y -= i === 0 ? 24 : isHeading ? 17 : 14;
  }
  return doc.save();
}

/** Render the resume onto an image and embed only the image: no text layer, so OCR is required. */
async function scannedPdf(text: string): Promise<Uint8Array> {
  const W = 1275;
  const H = 1650; // 150 dpi letter
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fbfaf7";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#1a1a1a";
  ctx.font = "22px sans-serif";
  let y = 90;
  for (const raw of text.split("\n")) {
    let line = "";
    for (const word of raw.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > W - 180 && line) {
        ctx.fillText(line, 90, y);
        y += 32;
        line = word;
      } else line = next;
    }
    ctx.fillText(line, 90, y);
    y += 32;
    if (y > H - 60) break;
  }
  const png = canvas.toBuffer("image/png");
  const doc = await PDFDocument.create();
  const img = await doc.embedPng(png);
  const page = doc.addPage([612, 792]);
  page.drawImage(img, { x: 0, y: 0, width: 612, height: 792 });
  return doc.save();
}

async function twoColumnPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([612, 792]);
  page.drawRectangle({ x: 0, y: 0, width: 200, height: 792, color: rgb(0.94, 0.95, 0.97) });
  const col = (lines: string[], x: number, width: number, startY: number) => {
    let y = startY;
    for (const line of lines.flatMap((l) => wrap(l, font, 10, width))) {
      const isHeading = /^[A-Z ]{4,}$/.test(line.trim());
      page.drawText(line, { x, y, size: isHeading ? 11 : 10, font: isHeading ? bold : font });
      y -= isHeading ? 16 : 13;
    }
  };
  page.drawText("Grace Nakamura", { x: 220, y: 740, size: 20, font: bold });
  page.drawText("Senior Backend Engineer · Atlanta, GA", { x: 220, y: 718, size: 11, font });
  col(
    ["CONTACT", "grace.nakamura@example.com", "(404) 555-0188", "", "SKILLS", "Java, Spring Boot, REST API, SQL, Microservices, Kafka, Docker, AWS", "", "EDUCATION", "B.S. Computer Science, Emory University (2017)"],
    24,
    160,
    740,
  );
  col(
    [
      "SUMMARY",
      "Backend engineer with seven years building payments and payroll systems.",
      "",
      "EXPERIENCE",
      "Senior Software Engineer — Paystream (Jan 2022 – Present)",
      "• Built Java microservices for payroll tax filing on AWS",
      "• Designed REST API endpoints for 30 partner integrations",
      "• Streamed payment events through Kafka",
      "",
      "Software Engineer — Ledger & Co (Jun 2018 – Dec 2021)",
      "• Spring Boot services and SQL reporting for a fintech lender",
      "• Containerized services with Docker",
    ],
    220,
    360,
    690,
  );
  return doc.save();
}

await rm(ROOT, { recursive: true, force: true });
for (const f of Object.values(FOLDER)) await mkdir(path.join(ROOT, f), { recursive: true });

const appByApplicant = new Map([...APPLICATIONS_BY_ID.values()].map((a) => [a.applicantId, a]));
const scannedIds = new Set(["apl-aisha-karim", "apl-olivia-brooks"]);
let count = 0;
for (const ap of APPLICANTS) {
  const app = appByApplicant.get(ap.id)!;
  const out = path.join(ROOT, FOLDER[app.jobId]!, ap.file.fileName.replace(/\s+/g, "_"));
  const bytes = scannedIds.has(ap.id) ? await scannedPdf(ap.file.rawText) : await textPdf(ap.file.rawText);
  await writeFile(out, bytes);
  count++;
}
await writeFile(path.join(ROOT, "backend-engineer", "grace_nakamura_two_column.pdf"), await twoColumnPdf());
// Corrupt: a PDF header followed by garbage and no xref table.
await writeFile(path.join(ROOT, "data-analyst", "scan_0042.pdf"), Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog >>\nthis file was truncated during upload"));
// Exact duplicate of an existing resume under a new name.
await copyFile(path.join(ROOT, "backend-engineer", "marcus_bell_resume.pdf"), path.join(ROOT, "backend-engineer", "Marcus Bell (1).pdf"));

console.log(`wrote ${count} resumes (+2 scanned among them), 1 two-column, 1 corrupt, 1 duplicate → ${path.relative(process.cwd(), ROOT)}/`);

// Extract, structure and score one resume.
import { PdfError, parsePdf } from "@/lib/pdf-parser";
import { failResume, getJob, logEvent, saveProcessedResume, scoreApplication } from "@/lib/repo";
import { extractResume } from "@/lib/resume-extractor";
import type { ResumeSource } from "@/lib/resume-source";

export interface ProcessPayload {
  orgId: string;
  resumeId: string;
  jobId: string;
  path: string;
}

export async function processResume(p: ProcessPayload, source: ResumeSource): Promise<void> {
  const fileName = p.path.slice(p.path.lastIndexOf("/") + 1);
  const job = getJob(p.orgId, p.jobId);
  if (!job) throw new Error(`job ${p.jobId} missing`);

  let parsed;
  try {
    parsed = await parsePdf(await source.download(p.path));
  } catch (err) {
    if (err instanceof PdfError) {
      failResume(p.orgId, p.resumeId, "needs_review", err.code, err.message);
      logEvent(p.orgId, "err", `ERR ${fileName}: ${err.message} → Needs review`);
      return;
    }
    throw err;
  }
  for (const page of parsed.ocrPages) logEvent(p.orgId, "ocr", `OCR used on page ${page}${parsed.ocrConfidence !== null ? ` (${parsed.ocrConfidence}% conf.)` : ""}`);

  const ex = await extractResume(parsed.text, { ocrConfidence: parsed.ocrConfidence });
  const sectionCount = Object.keys(ex.sections.sections).length;
  logEvent(
    p.orgId,
    "txt",
    `TXT extracted ${parsed.text.length.toLocaleString("en-US")} chars · ${sectionCount} sections · ${ex.method === "llm" ? ex.model : "heuristic"}`,
  );
  if (ex.droppedSkills > 0) logEvent(p.orgId, "info", `Dropped ${ex.droppedSkills} skill(s) with no matching quote in ${fileName}`);

  const needsReview = ex.reviewReasons.length > 0;
  const { applicationId } = saveProcessedResume(p.orgId, {
    resumeId: p.resumeId,
    jobId: p.jobId,
    fullName: ex.fullName,
    currentTitle: ex.currentTitle,
    structured: ex.resume,
    rawText: parsed.text,
    sections: ex.sections,
    method: parsed.method,
    pageCount: parsed.pageCount,
    ocrConfidence: parsed.ocrConfidence,
    status: needsReview ? "needs_review" : "extracted",
    reviewReasons: ex.reviewReasons,
    model: ex.model,
  });

  if (needsReview) {
    logEvent(p.orgId, "err", `ERR ${fileName}: ${ex.reviewReasons.join("; ")} → Needs review`);
    return;
  }
  const match = scoreApplication(p.orgId, applicationId);
  if (match) logEvent(p.orgId, "ok", `OK ${ex.fullName} → ${match.score}% vs "${job.title}"`);
}

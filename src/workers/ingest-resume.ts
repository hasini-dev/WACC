// Detect new files in the resume database and register them for processing.
import { draftJobForFolder } from "@/lib/job-catalog";
import { isPdf, MAX_BYTES, sha256 } from "@/lib/pdf-parser";
import { enqueue } from "@/lib/queue";
import {
  createJob,
  failResume,
  insertPendingResume,
  jobForFolder,
  knownPaths,
  logEvent,
  markSkipped,
  resumeBySha,
} from "@/lib/repo";
import { folderOf, type ResumeSource } from "@/lib/resume-source";

export interface IngestResult {
  registered: number;
  skipped: number;
}

export async function ingestNewFiles(orgId: string, source: ResumeSource): Promise<IngestResult> {
  const files = await source.list();
  const known = knownPaths(orgId);
  let registered = 0;
  let skipped = 0;

  for (const file of files) {
    if (known.has(file.path)) continue;
    const fileName = file.path.slice(file.path.lastIndexOf("/") + 1);
    const folder = folderOf(file.path);
    if (!folder) {
      logEvent(orgId, "info", `SKIP ${fileName}: not in a job folder`);
      markSkipped(orgId, file.path);
      skipped++;
      continue;
    }
    if (!/\.pdf$/i.test(fileName)) {
      logEvent(orgId, "info", `SKIP ${fileName}: only PDF resumes are supported`);
      markSkipped(orgId, file.path);
      skipped++;
      continue;
    }

    let job = jobForFolder(orgId, folder);
    if (!job) {
      job = createJob(orgId, folder, await draftJobForFolder(folder));
      logEvent(orgId, "info", `NEW job "${job.title}" from folder ${folder}/`);
    }

    const bytes = await source.download(file.path);
    const sha = sha256(bytes);
    const dup = resumeBySha(orgId, sha);
    if (dup) {
      logEvent(orgId, "dup", `DUP ${fileName} is identical to ${String(dup.storage_path)}; skipped`);
      markSkipped(orgId, file.path);
      skipped++;
      continue;
    }

    logEvent(orgId, "db", `DB fetched ${fileName}`);
    const resumeId = insertPendingResume(orgId, { storagePath: file.path, sha, bytes: bytes.byteLength });
    if (bytes.byteLength > MAX_BYTES || !isPdf(bytes)) {
      const reason = bytes.byteLength > MAX_BYTES ? "File is larger than 10 MB" : "Not a real PDF (missing %PDF header)";
      failResume(orgId, resumeId, "failed", bytes.byteLength > MAX_BYTES ? "TOO_LARGE" : "NOT_PDF", reason);
      logEvent(orgId, "err", `ERR ${fileName}: ${reason} → Needs review`);
      registered++;
      continue;
    }
    enqueue("process_resume", { orgId, resumeId, jobId: job.id, path: file.path }, `process:${resumeId}`);
    registered++;
  }
  return { registered, skipped };
}

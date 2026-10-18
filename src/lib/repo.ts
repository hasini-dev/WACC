// Server/worker only. Every read and write takes an orgId: this is the org
// scoping that Postgres RLS provides in the Supabase schema.
import { db, newId, nowIso, tx } from "@/lib/db";
import { SCORING_VERSION, scoreResume } from "@/lib/match-scoring";
import type { Applicant, Application, ExtractionMethod, MatchResult, StructuredResume } from "@/types/applicant";
import type { DeckCard, JobSummary, Me, NeedsReviewItem, PipelineEvent, PipelineLevel, UndoEntry } from "@/types/api";
import type { Job, JobRequirements } from "@/types/job";
import type { ApplicationStatus, Decision } from "@/types/review";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const json = <T>(v: unknown, fallback: T): T => {
  if (typeof v !== "string" || !v) return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
};

export class RepoError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

// ─── Orgs & members ─────────────────────────────────────────────────────────

export function ensureOrg(name: string): string {
  const row = db().prepare("select id from organizations order by created_at limit 1").get() as Row | undefined;
  if (row) return s(row.id);
  const id = newId("org");
  db().prepare("insert into organizations (id, name) values (?, ?)").run(id, name);
  return id;
}

export function addMember(orgId: string, userId: string, email: string, role: Me["role"]) {
  db()
    .prepare(
      `insert into org_members (org_id, user_id, email, role) values (?, ?, ?, ?)
       on conflict (org_id, user_id) do update set email = excluded.email, role = excluded.role`,
    )
    .run(orgId, userId, email.toLowerCase(), role);
}

export function hasMemberEmail(orgId: string, email: string): boolean {
  return !!db().prepare("select 1 from org_members where org_id = ? and lower(email) = lower(?)").get(orgId, email);
}

/** Membership by email. A member row created by the seed (user_id = "pending:…") is claimed on first sign-in. */
export function memberForUser(userId: string, email: string): Me | null {
  const conn = db();
  let row = conn
    .prepare("select m.*, o.name as org_name from org_members m join organizations o on o.id = m.org_id where m.user_id = ?")
    .get(userId) as Row | undefined;
  if (!row) {
    const pending = conn
      .prepare("select m.*, o.name as org_name from org_members m join organizations o on o.id = m.org_id where lower(m.email) = lower(?)")
      .get(email) as Row | undefined;
    if (!pending) return null;
    conn.prepare("update org_members set user_id = ? where org_id = ? and lower(email) = lower(?)").run(userId, s(pending.org_id), email);
    row = { ...pending, user_id: userId };
  }
  return { userId, email: s(row.email), orgId: s(row.org_id), orgName: s(row.org_name), role: s(row.role) as Me["role"] };
}

// ─── Jobs ───────────────────────────────────────────────────────────────────

function toJob(r: Row): Job & { storagePrefix: string | null } {
  return {
    id: s(r.id),
    title: s(r.title),
    location: s(r.location),
    minYears: Number(r.min_years),
    requirements: json<JobRequirements>(r.requirements, { must_have: [], nice_to_have: [], domains: [] }),
    status: s(r.status) as Job["status"],
    storagePrefix: r.storage_prefix == null ? null : s(r.storage_prefix),
  };
}

export function jobForFolder(orgId: string, folder: string) {
  const r = db().prepare("select * from jobs where org_id = ? and storage_prefix = ?").get(orgId, folder) as Row | undefined;
  return r ? toJob(r) : null;
}

export function createJob(orgId: string, folder: string, draft: Omit<Job, "id" | "status">) {
  const id = newId("job");
  db()
    .prepare("insert into jobs (id, org_id, title, location, min_years, requirements, storage_prefix) values (?, ?, ?, ?, ?, ?, ?)")
    .run(id, orgId, draft.title, draft.location, draft.minYears, JSON.stringify(draft.requirements), folder);
  return toJob(db().prepare("select * from jobs where id = ?").get(id) as Row);
}

export function getJob(orgId: string, jobId: string) {
  const r = db().prepare("select * from jobs where org_id = ? and id = ?").get(orgId, jobId) as Row | undefined;
  return r ? toJob(r) : null;
}

/** Latest non-undone review per application, as status. */
const STATUS_SQL = `
  coalesce((
    select case r.decision when 'shortlist' then 'shortlist' when 'pass' then 'pass' else 'to_review' end
    from reviews r where r.application_id = a.id and r.undone_at is null
    order by r.seq desc limit 1
  ), 'to_review')`;

/** Applications that may appear in a deck: resume extracted (not pending, failed or needing review) and scored. */
const IN_DECK_SQL = `exists (select 1 from resumes rs where rs.id = a.resume_id and rs.status = 'extracted')
  and exists (select 1 from match_scores ms where ms.application_id = a.id)`;

export function listJobs(orgId: string): JobSummary[] {
  const rows = db().prepare("select * from jobs where org_id = ? and status != 'closed' order by title").all(orgId) as Row[];
  const counts = db()
    .prepare(
      `select a.job_id, ${STATUS_SQL} as status, count(*) as n
       from applications a where a.org_id = ? and ${IN_DECK_SQL} group by a.job_id, status`,
    )
    .all(orgId) as Row[];
  return rows.map((r) => {
    const job = toJob(r);
    const c = { to_review: 0, shortlist: 0, pass: 0 };
    for (const row of counts) if (row.job_id === job.id) c[s(row.status) as ApplicationStatus] = Number(row.n);
    return { ...job, counts: c };
  });
}

// ─── Deck & applicants ──────────────────────────────────────────────────────

function currentScore(applicationId: string): MatchResult | null {
  const r = db()
    .prepare("select detail from match_scores where application_id = ? order by created_at desc, rowid desc limit 1")
    .get(applicationId) as Row | undefined;
  return r ? json<MatchResult | null>(r.detail, null) : null;
}

function toApplicant(r: Row, withText: boolean): Applicant {
  const structured = json<StructuredResume>(r.structured, {
    contact: { email: "", phone: "", location: "" },
    summary: "",
    experience: [],
    education: [],
    skills: [],
  });
  const path = s(r.storage_path);
  return {
    id: s(r.applicant_id),
    fullName: s(r.full_name),
    currentTitle: s(r.current_title),
    location: s(r.location) || structured.contact.location,
    resume: structured,
    file: {
      fileName: path.slice(path.lastIndexOf("/") + 1),
      source: "resume_db",
      extractionMethod: (s(r.extraction_method) || "text") as ExtractionMethod,
      pageCount: Number(r.page_count ?? 1),
      rawText: withText ? s(r.raw_text) : "",
    },
  };
}

const CARD_SQL = `
  select a.id as application_id, a.job_id, a.applied_at, a.applicant_id,
         p.full_name, p.current_title, p.location,
         rs.storage_path, rs.extraction_method, rs.page_count, rs.structured, rs.raw_text, rs.created_at as received_at,
         ${STATUS_SQL} as status,
         (select score from match_scores ms where ms.application_id = a.id order by ms.created_at desc, ms.rowid desc limit 1) as score
  from applications a
  join applicants p on p.id = a.applicant_id
  join resumes rs on rs.id = a.resume_id
  where a.org_id = ? `;

function toCard(r: Row, withText = false): DeckCard | null {
  const match = currentScore(s(r.application_id));
  if (!match) return null;
  const application: Application = {
    id: s(r.application_id),
    applicantId: s(r.applicant_id),
    jobId: s(r.job_id),
    appliedAt: s(r.applied_at),
    match,
  };
  return { application, applicant: toApplicant(r, withText), status: s(r.status) as ApplicationStatus, receivedAt: s(r.received_at) };
}

export function deck(orgId: string, jobId: string, status: ApplicationStatus | "all"): DeckCard[] {
  const rows = db()
    .prepare(`${CARD_SQL} and a.job_id = ? and ${IN_DECK_SQL} order by score desc, a.applied_at asc`)
    .all(orgId, jobId) as Row[];
  return rows
    .map((r) => toCard(r))
    .filter((c): c is DeckCard => c !== null && (status === "all" || c.status === status));
}

export function applicantDetail(orgId: string, applicantId: string): DeckCard | null {
  const r = db().prepare(`${CARD_SQL} and a.applicant_id = ? order by a.applied_at desc limit 1`).get(orgId, applicantId) as Row | undefined;
  return r ? toCard(r, true) : null;
}

// ─── Reviews ────────────────────────────────────────────────────────────────

function statusOf(applicationId: string): ApplicationStatus {
  const r = db()
    .prepare("select decision from reviews where application_id = ? and undone_at is null order by seq desc limit 1")
    .get(applicationId) as Row | undefined;
  const d = r ? s(r.decision) : "";
  return d === "shortlist" || d === "pass" ? d : "to_review";
}

export function createReview(me: Me, applicationId: string, decision: Decision, reason?: string): UndoEntry {
  if (me.role === "viewer") throw new RepoError(403, "Viewers cannot review");
  return tx(() => {
    const app = db().prepare("select id, org_id from applications where id = ? and org_id = ?").get(applicationId, me.orgId) as Row | undefined;
    if (!app) throw new RepoError(404, "Application not found");
    const current = statusOf(applicationId);
    if (decision === "reset" ? current === "to_review" : current !== "to_review") {
      throw new RepoError(409, decision === "reset" ? "Already in the deck" : "Already decided");
    }
    const id = newId("rev");
    const createdAt = nowIso();
    const seq = Number((db().prepare("select coalesce(max(seq), 0) + 1 as n from reviews").get() as Row).n);
    db()
      .prepare("insert into reviews (id, org_id, application_id, reviewer_id, decision, reason, created_at, seq) values (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, me.orgId, applicationId, me.userId, decision, reason ?? null, createdAt, seq);
    audit(me.orgId, me.userId, `review.${decision}`, "review", id, { applicationId });
    return { reviewId: id, applicationId, decision, createdAt };
  });
}

export function undoReview(me: Me, reviewId: string): UndoEntry {
  return tx(() => {
    const r = db().prepare("select * from reviews where id = ? and org_id = ?").get(reviewId, me.orgId) as Row | undefined;
    if (!r) throw new RepoError(404, "Review not found");
    if (r.reviewer_id !== me.userId && me.role !== "admin") throw new RepoError(403, "Only the reviewer or an admin can undo");
    if (r.undone_at) throw new RepoError(409, "Already undone");
    db().prepare("update reviews set undone_at = ? where id = ?").run(nowIso(), reviewId);
    audit(me.orgId, me.userId, "review.undo", "review", reviewId, { applicationId: s(r.application_id) });
    return { reviewId, applicationId: s(r.application_id), decision: s(r.decision) as Decision, createdAt: s(r.created_at) };
  });
}

export function undoStack(me: Me, jobId: string, limit = 20): UndoEntry[] {
  const rows = db()
    .prepare(
      `select r.* from reviews r join applications a on a.id = r.application_id
       where r.org_id = ? and r.reviewer_id = ? and a.job_id = ? and r.undone_at is null
       order by r.seq desc limit ?`,
    )
    .all(me.orgId, me.userId, jobId, limit) as Row[];
  return rows.map((r) => ({ reviewId: s(r.id), applicationId: s(r.application_id), decision: s(r.decision) as Decision, createdAt: s(r.created_at) }));
}

// ─── Pipeline (worker writes) ───────────────────────────────────────────────

export function audit(orgId: string | null, actorId: string | null, action: string, entity: string, entityId: string | null, meta: object = {}) {
  db()
    .prepare("insert into audit_log (org_id, actor_id, action, entity, entity_id, meta) values (?, ?, ?, ?, ?, ?)")
    .run(orgId, actorId, action, entity, entityId, JSON.stringify(meta));
}

export function logEvent(orgId: string, level: PipelineLevel, message: string) {
  db().prepare("insert into pipeline_events (org_id, level, message) values (?, ?, ?)").run(orgId, level, message);
}

export function recentEvents(orgId: string, limit = 50): PipelineEvent[] {
  return (db().prepare("select * from pipeline_events where org_id = ? order by id desc limit ?").all(orgId, limit) as Row[]).map((r) => ({
    id: Number(r.id),
    at: s(r.created_at),
    level: s(r.level) as PipelineLevel,
    text: s(r.message),
  }));
}

export function getSetting(orgId: string, key: string): string | null {
  const r = db().prepare("select value from settings where org_id = ? and key = ?").get(orgId, key) as Row | undefined;
  return r ? s(r.value) : null;
}

export function setSetting(orgId: string, key: string, value: string) {
  db()
    .prepare("insert into settings (org_id, key, value) values (?, ?, ?) on conflict (org_id, key) do update set value = excluded.value")
    .run(orgId, key, value);
}

export function resumeBySha(orgId: string, sha: string) {
  return db().prepare("select id, storage_path from resumes where org_id = ? and sha256 = ?").get(orgId, sha) as Row | undefined;
}

export function knownPaths(orgId: string): Set<string> {
  const rows = db().prepare("select storage_path from resumes where org_id = ?").all(orgId) as Row[];
  const skipped = db().prepare("select value from settings where org_id = ? and key like 'skip:%'").all(orgId) as Row[];
  return new Set([...rows.map((r) => s(r.storage_path)), ...skipped.map((r) => s(r.value))]);
}

/** Remember a file we decided not to ingest (duplicate, not a PDF) so it is not re-downloaded every poll. */
export function markSkipped(orgId: string, storagePath: string) {
  setSetting(orgId, `skip:${storagePath}`, storagePath);
}

export function insertPendingResume(orgId: string, p: { storagePath: string; sha: string; bytes: number }) {
  const id = newId("res");
  db()
    .prepare("insert into resumes (id, org_id, storage_path, sha256, byte_size, status) values (?, ?, ?, ?, ?, 'pending')")
    .run(id, orgId, p.storagePath, p.sha, p.bytes);
  return id;
}

export function failResume(orgId: string, resumeId: string, status: "needs_review" | "failed", code: string, detail: string) {
  db()
    .prepare("update resumes set status = ?, error_code = ?, error_detail = ? where id = ? and org_id = ?")
    .run(status, code, detail, resumeId, orgId);
}

export interface ProcessedResume {
  resumeId: string;
  jobId: string;
  fullName: string;
  currentTitle: string;
  structured: StructuredResume;
  rawText: string;
  sections: object;
  method: ExtractionMethod;
  pageCount: number;
  ocrConfidence: number | null;
  status: "extracted" | "needs_review";
  reviewReasons: string[];
  model: string | null;
}

/**
 * Save extraction results and link applicant + application. Dedup: same email
 * in the org → same applicant; never two applications for one person and job.
 */
export function saveProcessedResume(orgId: string, p: ProcessedResume): { applicationId: string; applicantId: string } {
  return tx(() => {
    const conn = db();
    conn
      .prepare(
        `update resumes set status = ?, extraction_method = ?, page_count = ?, char_count = ?, ocr_confidence = ?,
           raw_text = ?, sections = ?, structured = ?, error_code = ?, error_detail = ? where id = ? and org_id = ?`,
      )
      .run(
        p.status,
        p.method,
        p.pageCount,
        p.rawText.length,
        p.ocrConfidence,
        p.rawText,
        JSON.stringify(p.sections),
        JSON.stringify(p.structured),
        p.status === "needs_review" ? "NEEDS_REVIEW" : null,
        p.status === "needs_review" ? p.reviewReasons.join("; ") : null,
        p.resumeId,
        orgId,
      );

    const email = p.structured.contact.email.trim().toLowerCase();
    const applicant = email
      ? (conn.prepare("select id from applicants where org_id = ? and lower(email) = ?").get(orgId, email) as Row | undefined)
      : undefined;
    let applicantId = applicant ? s(applicant.id) : "";
    if (!applicantId) {
      applicantId = newId("apl");
      conn
        .prepare("insert into applicants (id, org_id, full_name, email, phone, location, current_title, external_id) values (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(applicantId, orgId, p.fullName, email || null, p.structured.contact.phone || null, p.structured.contact.location || null, p.currentTitle, p.resumeId);
    } else {
      conn.prepare("update applicants set current_title = coalesce(nullif(?, ''), current_title) where id = ?").run(p.currentTitle, applicantId);
    }
    conn.prepare("update resumes set applicant_id = ? where id = ?").run(applicantId, p.resumeId);

    const existing = conn.prepare("select id from applications where job_id = ? and applicant_id = ?").get(p.jobId, applicantId) as Row | undefined;
    let applicationId = existing ? s(existing.id) : "";
    if (applicationId) {
      conn.prepare("update applications set resume_id = ? where id = ?").run(p.resumeId, applicationId);
    } else {
      applicationId = newId("app");
      conn
        .prepare("insert into applications (id, org_id, applicant_id, job_id, resume_id, applied_at) values (?, ?, ?, ?, ?, ?)")
        .run(applicationId, orgId, applicantId, p.jobId, p.resumeId, nowIso());
    }
    return { applicationId, applicantId };
  });
}

/** Score an application against its job's current requirements. Always inserts a new row (history is kept). */
export function scoreApplication(orgId: string, applicationId: string, now = new Date()): MatchResult | null {
  const r = db()
    .prepare(
      `select a.id, j.*, rs.structured from applications a join jobs j on j.id = a.job_id join resumes rs on rs.id = a.resume_id
       where a.id = ? and a.org_id = ?`,
    )
    .get(applicationId, orgId) as Row | undefined;
  if (!r) return null;
  const job = toJob(r);
  const structured = json<StructuredResume | null>(r.structured, null);
  if (!structured) return null;
  // Only evidence fields are passed: no name, contact, school or graduation year.
  const result = scoreResume({ summary: structured.summary, experience: structured.experience, skills: structured.skills }, job, now);
  db()
    .prepare("insert into match_scores (id, application_id, score, breakdown, evidence, reasons, detail, scoring_version) values (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(
      newId("ms"),
      applicationId,
      result.score,
      JSON.stringify(result.breakdown),
      JSON.stringify(result.evidence),
      JSON.stringify(result.reasons),
      JSON.stringify(result),
      SCORING_VERSION,
    );
  return result;
}

export function pipelineCounts(orgId: string) {
  const rows = db().prepare("select status, count(*) as n from resumes where org_id = ? group by status").all(orgId) as Row[];
  const by: Record<string, number> = {};
  for (const r of rows) by[s(r.status)] = Number(r.n);
  const total = Object.values(by).reduce((a, b) => a + b, 0);
  const processed = (by.extracted ?? 0) + (by.needs_review ?? 0) + (by.failed ?? 0);
  return { total, processed, by };
}

export function needsReview(orgId: string): NeedsReviewItem[] {
  const rows = db()
    .prepare(
      `select rs.id, rs.storage_path, rs.error_detail, rs.error_code, rs.created_at, j.title
       from resumes rs left join jobs j on j.org_id = rs.org_id and j.storage_prefix = substr(rs.storage_path, 1, instr(rs.storage_path, '/') - 1)
       where rs.org_id = ? and rs.status in ('needs_review', 'failed') order by rs.created_at desc`,
    )
    .all(orgId) as Row[];
  return rows.map((r) => {
    const path = s(r.storage_path);
    return {
      resumeId: s(r.id),
      fileName: path.slice(path.lastIndexOf("/") + 1),
      jobTitle: r.title == null ? null : s(r.title),
      reason: s(r.error_detail) || s(r.error_code),
      at: s(r.created_at),
    };
  });
}

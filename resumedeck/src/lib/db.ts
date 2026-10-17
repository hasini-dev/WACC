// Server/worker only: never import from a client component.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Prototype persistence: a local SQLite file shared by the Next server and the
 * worker process (WAL mode lets both read and write). The tables mirror
 * supabase/migrations/*_core_schema.sql so moving to Postgres is a data-layer
 * swap, not a redesign. Row-level security is enforced in `repo.ts` by always
 * scoping queries to the caller's org.
 */
const SCHEMA = `
create table if not exists organizations (
  id text primary key, name text not null, created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create table if not exists org_members (
  org_id text not null references organizations(id) on delete cascade,
  user_id text not null,
  email text not null,
  role text not null check (role in ('admin','recruiter','viewer')),
  primary key (org_id, user_id)
);
create unique index if not exists org_members_email on org_members(org_id, lower(email));

create table if not exists jobs (
  id text primary key,
  org_id text not null references organizations(id) on delete cascade,
  title text not null, location text not null default '', min_years real not null default 0,
  requirements text not null, status text not null default 'open',
  storage_prefix text, external_id text, source text not null default 'resume_db',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (org_id, storage_prefix)
);

create table if not exists applicants (
  id text primary key,
  org_id text not null references organizations(id) on delete cascade,
  full_name text not null, email text, phone text, location text, current_title text,
  external_id text, source text not null default 'resume_db',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (org_id, source, external_id)
);

create table if not exists resumes (
  id text primary key,
  org_id text not null references organizations(id) on delete cascade,
  applicant_id text references applicants(id) on delete cascade,
  storage_path text not null, sha256 text not null, mime_type text not null default 'application/pdf',
  byte_size integer not null, status text not null default 'pending',
  extraction_method text, page_count integer, char_count integer, ocr_confidence real,
  raw_text text, sections text, structured text, error_code text, error_detail text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (org_id, sha256)
);
create index if not exists resumes_path on resumes(org_id, storage_path);

create table if not exists applications (
  id text primary key,
  org_id text not null references organizations(id) on delete cascade,
  applicant_id text not null references applicants(id) on delete cascade,
  job_id text not null references jobs(id) on delete cascade,
  resume_id text references resumes(id) on delete set null,
  applied_at text not null, external_id text,
  unique (job_id, applicant_id)
);

create table if not exists match_scores (
  id text primary key,
  application_id text not null references applications(id) on delete cascade,
  score integer not null, breakdown text not null, evidence text not null, reasons text not null,
  detail text not null, scoring_version text not null, model text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists match_scores_app on match_scores(application_id, created_at desc);

create table if not exists reviews (
  id text primary key,
  org_id text not null references organizations(id) on delete cascade,
  application_id text not null references applications(id) on delete cascade,
  reviewer_id text not null,
  decision text not null check (decision in ('shortlist','pass','reset')),
  reason text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  seq integer not null,
  undone_at text
);
create index if not exists reviews_app on reviews(application_id, seq desc);

create table if not exists processing_jobs (
  id text primary key, kind text not null, payload text not null default '{}',
  status text not null default 'queued', attempts integer not null default 0, max_attempts integer not null default 3,
  run_after text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  locked_at text, last_error text, dedupe_key text unique,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists pipeline_events (
  id integer primary key autoincrement,
  org_id text not null, level text not null, message text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists settings (
  org_id text not null, key text not null, value text not null, primary key (org_id, key)
);

create table if not exists audit_log (
  id integer primary key autoincrement,
  org_id text, actor_id text, action text not null, entity text not null, entity_id text,
  meta text not null default '{}',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Append-only reviews: only undone_at may change, once.
create trigger if not exists reviews_guard before update on reviews
begin
  select raise(abort, 'reviews are append-only')
  where new.decision is not old.decision or new.application_id is not old.application_id
     or new.reviewer_id is not old.reviewer_id or new.created_at is not old.created_at
     or old.undone_at is not null;
end;
create trigger if not exists reviews_no_delete before delete on reviews
when (select count(*) from applications where id = old.application_id) > 0
begin select raise(abort, 'reviews are append-only'); end;
`;

const globalForDb = globalThis as unknown as { __clickedDb?: DatabaseSync };

export function dbPath(): string {
  return process.env.DATA_DIR ? path.join(process.env.DATA_DIR, "clicked.db") : path.join(process.cwd(), ".data", "clicked.db");
}

export function db(): DatabaseSync {
  if (globalForDb.__clickedDb) return globalForDb.__clickedDb;
  const file = dbPath();
  mkdirSync(path.dirname(file), { recursive: true });
  const conn = new DatabaseSync(file);
  conn.exec("pragma journal_mode = wal; pragma busy_timeout = 5000; pragma foreign_keys = on;");
  conn.exec(SCHEMA);
  globalForDb.__clickedDb = conn;
  return conn;
}

export function tx<T>(fn: () => T): T {
  const conn = db();
  conn.exec("begin immediate");
  try {
    const out = fn();
    conn.exec("commit");
    return out;
  } catch (err) {
    conn.exec("rollback");
    throw err;
  }
}

export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
export const nowIso = () => new Date().toISOString();

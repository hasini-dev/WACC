// Server/worker only. Tiny SQLite-backed job queue (mirrors processing_jobs + claim_processing_jobs in Postgres).
import { db, newId, nowIso } from "@/lib/db";

export interface QueueJob<P = Record<string, unknown>> {
  id: string;
  kind: string;
  payload: P;
  attempts: number;
  maxAttempts: number;
}

export function enqueue(kind: string, payload: object, dedupeKey?: string) {
  db()
    .prepare("insert into processing_jobs (id, kind, payload, dedupe_key) values (?, ?, ?, ?) on conflict (dedupe_key) do nothing")
    .run(newId("pj"), kind, JSON.stringify(payload), dedupeKey ?? null);
}

/** Atomically claim the next ready job (SQLite serializes writers, so no two workers get the same row). */
export function claim<P>(kinds: string[]): QueueJob<P> | null {
  const placeholders = kinds.map(() => "?").join(",");
  const row = db()
    .prepare(
      `update processing_jobs set status = 'running', locked_at = ?, attempts = attempts + 1
       where id = (
         select id from processing_jobs
         where kind in (${placeholders}) and run_after <= ?
           and (status = 'queued' or (status = 'running' and locked_at < ?))
         order by run_after, created_at limit 1
       )
       returning *`,
    )
    .get(nowIso(), ...kinds, nowIso(), new Date(Date.now() - 5 * 60_000).toISOString()) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    kind: String(row.kind),
    payload: JSON.parse(String(row.payload)) as P,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
  };
}

export function complete(id: string) {
  db().prepare("update processing_jobs set status = 'done', locked_at = null where id = ?").run(id);
}

/** Exponential backoff with jitter; `dead` after max attempts. */
export function fail(job: QueueJob<unknown>, error: string) {
  const dead = job.attempts >= job.maxAttempts;
  const delayMs = Math.min(5 * 60_000, 2 ** job.attempts * 1000) * (0.5 + Math.random());
  db()
    .prepare("update processing_jobs set status = ?, last_error = ?, locked_at = null, run_after = ? where id = ?")
    .run(dead ? "dead" : "queued", error.slice(0, 500), new Date(Date.now() + delayMs).toISOString(), job.id);
  return dead;
}

export function queueDepth(): { queued: number; dead: number } {
  const r = db()
    .prepare("select sum(status in ('queued','running')) as q, sum(status = 'dead') as d from processing_jobs")
    .get() as Record<string, unknown>;
  return { queued: Number(r.q ?? 0), dead: Number(r.d ?? 0) };
}

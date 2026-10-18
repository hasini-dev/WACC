// `npm run worker`: poll the resume database, then process queued resumes one at a time.
import { claim, complete, fail } from "@/lib/queue";
import { ensureOrg, getSetting, logEvent, setSetting } from "@/lib/repo";
import { resumeSourceFromEnv } from "@/lib/resume-source";
import { ingestNewFiles } from "./ingest-resume";
import { processResume, type ProcessPayload } from "./process-resume";

const POLL_MS = Number(process.env.RESUME_POLL_INTERVAL_MS || 10_000);
const TICK_MS = 1_000;
const once = process.argv.includes("--once");

const orgId = ensureOrg(process.env.COMPANY_NAME || "Brightline Payroll");
const source = resumeSourceFromEnv();
setSetting(orgId, "source_name", source.name);
console.log(`[worker] org=${orgId} source=${source.name} poll=${POLL_MS}ms`);

let lastPoll = 0;

async function poll() {
  lastPoll = Date.now();
  try {
    const r = await ingestNewFiles(orgId, source);
    setSetting(orgId, "last_sync_at", new Date().toISOString());
    setSetting(orgId, "last_sync_error", "");
    if (r.registered) console.log(`[worker] registered ${r.registered} new file(s)`);
  } catch (err) {
    const msg = (err as Error).message;
    setSetting(orgId, "last_sync_error", msg);
    console.error("[worker] sync failed:", msg);
  }
}

async function processNext(): Promise<boolean> {
  const job = claim<ProcessPayload>(["process_resume"]);
  if (!job) return false;
  try {
    await processResume(job.payload, source);
    complete(job.id);
  } catch (err) {
    const msg = (err as Error).message;
    const dead = fail(job, msg);
    logEvent(orgId, "err", `ERR processing ${job.payload.path.split("/").pop()}: ${msg.slice(0, 140)}${dead ? " (gave up)" : " (will retry)"}`);
  }
  return true;
}

async function tick() {
  setSetting(orgId, "worker_heartbeat", new Date().toISOString());
  const paused = getSetting(orgId, "sync_paused") === "true";
  const pullNow = getSetting(orgId, "pull_requested") === "true";
  if (pullNow) {
    setSetting(orgId, "pull_requested", "false");
    await poll();
    await processNext();
    return;
  }
  if (paused) return;
  if (Date.now() - lastPoll >= POLL_MS) await poll();
  await processNext();
}

if (once) {
  await poll();
  while (await processNext()) {
    /* drain */
  }
  console.log("[worker] done");
} else {
  for (;;) {
    try {
      await tick();
    } catch (err) {
      console.error("[worker] tick failed:", err);
    }
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
}

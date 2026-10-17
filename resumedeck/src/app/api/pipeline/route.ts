import { z } from "zod";
import { HttpError, handle, parse, readJson, requireMe } from "@/lib/api";
import { getSetting, needsReview, pipelineCounts, recentEvents, setSetting } from "@/lib/repo";
import type { PipelineStatus } from "@/types/api";

export const dynamic = "force-dynamic";

const HEARTBEAT_STALE_MS = 15_000;

export const GET = handle(async () => {
  const me = await requireMe();
  const { processed, total } = pipelineCounts(me.orgId);
  const heartbeat = getSetting(me.orgId, "worker_heartbeat");
  const lastError = getSetting(me.orgId, "last_sync_error") || null;
  const paused = getSetting(me.orgId, "sync_paused") === "true";
  const alive = !!heartbeat && Date.now() - Date.parse(heartbeat) < HEARTBEAT_STALE_MS;
  const state: PipelineStatus["state"] = !alive ? "offline" : paused ? "paused" : lastError ? "error" : processed < total ? "live" : "idle";
  const status: PipelineStatus = {
    source: getSetting(me.orgId, "source_name") ?? "resume database",
    state,
    processed,
    total,
    lastSyncAt: getSetting(me.orgId, "last_sync_at"),
    lastError,
    events: recentEvents(me.orgId),
    needsReview: needsReview(me.orgId),
  };
  return Response.json(status);
});

const Action = z.object({ action: z.enum(["pause", "resume", "pull"]) });

export const POST = handle(async (req: Request) => {
  const me = await requireMe();
  if (me.role === "viewer") throw new HttpError(403, "Viewers cannot control sync");
  const { action } = parse(Action, await readJson(req));
  if (action === "pull") setSetting(me.orgId, "pull_requested", "true");
  else setSetting(me.orgId, "sync_paused", action === "pause" ? "true" : "false");
  return Response.json({ ok: true });
});

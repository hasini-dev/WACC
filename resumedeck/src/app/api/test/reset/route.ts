import { db, nowIso } from "@/lib/db";

/**
 * Test-only: return every application to its deck by undoing all active reviews
 * (reviews are append-only, so nothing is deleted). Disabled unless ALLOW_TEST_RESET=1.
 */
export async function POST() {
  if (process.env.ALLOW_TEST_RESET !== "1") return Response.json({ error: "Not found" }, { status: 404 });
  db().prepare("update reviews set undone_at = ? where undone_at is null").run(nowIso());
  db().prepare("delete from settings where key in ('sync_paused', 'pull_requested')").run();
  return Response.json({ ok: true });
}

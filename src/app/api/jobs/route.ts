import { handle, requireMe } from "@/lib/api";
import { listJobs } from "@/lib/repo";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const me = await requireMe();
  return Response.json({ jobs: listJobs(me.orgId) });
});

import type { NextRequest } from "next/server";
import { z } from "zod";
import { HttpError, handle, parse, requireMe } from "@/lib/api";
import { deck, getJob } from "@/lib/repo";

export const dynamic = "force-dynamic";

const Query = z.object({ status: z.enum(["to_review", "shortlist", "pass", "all"]).default("to_review") });

export const GET = handle(async (req: NextRequest, ctx: RouteContext<"/api/jobs/[jobId]/deck">) => {
  const me = await requireMe();
  const { jobId } = await ctx.params;
  const { status } = parse(Query, { status: req.nextUrl.searchParams.get("status") ?? undefined });
  const job = getJob(me.orgId, jobId);
  if (!job) throw new HttpError(404, "Job not found");
  return Response.json({ job, cards: deck(me.orgId, jobId, status) });
});

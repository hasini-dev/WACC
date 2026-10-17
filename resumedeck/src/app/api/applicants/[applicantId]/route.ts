import type { NextRequest } from "next/server";
import { HttpError, handle, requireMe } from "@/lib/api";
import { applicantDetail, getJob } from "@/lib/repo";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: NextRequest, ctx: RouteContext<"/api/applicants/[applicantId]">) => {
  const me = await requireMe();
  const { applicantId } = await ctx.params;
  const card = applicantDetail(me.orgId, applicantId);
  if (!card) throw new HttpError(404, "Applicant not found");
  return Response.json({ card, job: getJob(me.orgId, card.application.jobId) });
});

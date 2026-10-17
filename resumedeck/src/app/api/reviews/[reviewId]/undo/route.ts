import type { NextRequest } from "next/server";
import { handle, requireMe } from "@/lib/api";
import { undoReview } from "@/lib/repo";

export const POST = handle(async (_req: NextRequest, ctx: RouteContext<"/api/reviews/[reviewId]/undo">) => {
  const me = await requireMe();
  const { reviewId } = await ctx.params;
  return Response.json({ review: undoReview(me, reviewId) });
});

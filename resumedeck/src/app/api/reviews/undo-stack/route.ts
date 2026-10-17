import type { NextRequest } from "next/server";
import { z } from "zod";
import { handle, parse, requireMe } from "@/lib/api";
import { undoStack } from "@/lib/repo";

export const dynamic = "force-dynamic";

const Query = z.object({ jobId: z.string().min(1) });

export const GET = handle(async (req: NextRequest) => {
  const me = await requireMe();
  const { jobId } = parse(Query, { jobId: req.nextUrl.searchParams.get("jobId") });
  return Response.json({ reviews: undoStack(me, jobId) });
});

import { handle, parse, readJson, requireMe } from "@/lib/api";
import { createReview } from "@/lib/repo";
import { ReviewInputSchema } from "@/lib/validation";

export const POST = handle(async (req: Request) => {
  const me = await requireMe();
  const input = parse(ReviewInputSchema, await readJson(req));
  const review = createReview(me, input.applicationId, input.decision, input.reason);
  return Response.json({ review }, { status: 201 });
});

import { describe, expect, it } from "vitest";
import { APPLICANTS, JOBS } from "@/lib/mock-data";
import { JobRequirementsSchema, ReviewInputSchema, StructuredResumeSchema } from "@/lib/validation";

describe("validation schemas", () => {
  it("accept every mock job's requirements", () => {
    for (const j of JOBS) expect(JobRequirementsSchema.safeParse(j.requirements).success, j.id).toBe(true);
  });

  it("accept every mock structured resume", () => {
    for (const a of APPLICANTS) expect(StructuredResumeSchema.safeParse(a.resume).success, a.id).toBe(true);
  });

  it("reject malformed input", () => {
    expect(ReviewInputSchema.safeParse({ applicationId: "x", decision: "reject" }).success).toBe(false);
    expect(JobRequirementsSchema.safeParse({ must_have: [], nice_to_have: [], domains: [] }).success).toBe(false);
  });
});

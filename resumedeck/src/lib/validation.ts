import { z } from "zod";

export const SkillRequirementSchema = z.object({
  skill: z.string().min(1),
  aliases: z.array(z.string()),
  weight: z.number().positive(),
});

/** Shape of `jobs.requirements` (jsonb). */
export const JobRequirementsSchema = z.object({
  must_have: z.array(SkillRequirementSchema).min(1),
  nice_to_have: z.array(SkillRequirementSchema),
  domains: z.array(z.string().min(1)),
});

const YearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "expected YYYY-MM");

export const StructuredResumeSchema = z.object({
  contact: z.object({ email: z.string(), phone: z.string(), location: z.string() }),
  summary: z.string(),
  experience: z.array(
    z.object({
      title: z.string().min(1),
      company: z.string().min(1),
      start: YearMonth,
      end: YearMonth.nullable(),
      bullets: z.array(z.string()),
    }),
  ),
  education: z.array(z.object({ degree: z.string(), school: z.string(), year: z.string().optional() })),
  skills: z.array(
    z.object({
      name: z.string().min(1),
      evidence: z.string().min(1),
      section: z.enum(["summary", "experience", "skills", "education", "projects", "certifications"]),
    }),
  ),
});

export const ReviewInputSchema = z.object({
  applicationId: z.string().min(1),
  decision: z.enum(["shortlist", "pass", "reset"]),
  reason: z.string().max(500).optional(),
});

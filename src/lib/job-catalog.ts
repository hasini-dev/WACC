// Server/worker only. Bucket folder → job definition.
import { z } from "zod";
import { chatJson, type LlmConfig } from "@/lib/llm";
import { JOBS as TEMPLATES } from "@/lib/mock-data";
import { JobRequirementsSchema } from "@/lib/validation";
import type { Job, JobRequirements } from "@/types/job";

export type JobDraft = Omit<Job, "id" | "status">;

export function humanizeFolder(folder: string): string {
  const words = folder
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ");
  const keepUpper = new Set(["ux", "ui", "hr", "qa", "it", "ml", "ai", "sre", "devops"]);
  return words
    .map((w) => (keepUpper.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

const MATCHERS: Array<[RegExp, string]> = [
  [/(back.?end|java|software|engineer|developer|swe)/i, "job-backend-java"],
  [/(data|analyst|analytics|people)/i, "job-data-people"],
  [/(ux|ui|design)/i, "job-ux-designer"],
];

/** Use one of the spec's three job templates when the folder name clearly matches it. */
export function templateForFolder(folder: string): Job | undefined {
  for (const [re, id] of MATCHERS) if (re.test(folder)) return TEMPLATES.find((j) => j.id === id);
  return undefined;
}

const DraftSchema = z.object({
  title: z.string(),
  location: z.string(),
  min_years: z.number().min(0).max(20),
  requirements: JobRequirementsSchema,
});

export async function draftJobForFolder(folder: string, llm?: LlmConfig): Promise<JobDraft> {
  const template = templateForFolder(folder);
  if (template) {
    return { title: template.title, location: template.location, minYears: template.minYears, requirements: template.requirements };
  }
  const title = humanizeFolder(folder);
  const result = await chatJson({
    system:
      "You write concise hiring requirements. Given a job title, return 4-5 must-have skills, 4-5 nice-to-have skills (each {skill, aliases: [], weight: 1}), 3-4 industry domains, a plausible minimum years of experience, and location 'Remote'.",
    user: `Job title: ${title}`,
    schema: DraftSchema,
    cfg: llm,
  });
  if (result.ok) {
    return { title: result.data.title || title, location: result.data.location, minYears: result.data.min_years, requirements: result.data.requirements };
  }
  const fallback: JobRequirements = { must_have: [], nice_to_have: [], domains: [] };
  return { title, location: "", minYears: 0, requirements: fallback };
}

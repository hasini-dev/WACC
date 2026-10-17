export interface SkillRequirement {
  skill: string;
  aliases: string[];
  weight: number;
}

/** Mirrors the `jobs.requirements` jsonb column (validated with Zod in Phase 2). */
export interface JobRequirements {
  must_have: SkillRequirement[];
  nice_to_have: SkillRequirement[];
  domains: string[];
}

export type JobStatus = "open" | "paused" | "closed";

export interface Job {
  id: string;
  title: string;
  location: string;
  minYears: number;
  requirements: JobRequirements;
  status: JobStatus;
}

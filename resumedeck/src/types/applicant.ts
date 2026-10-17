export type ResumeSection = "summary" | "experience" | "skills" | "education" | "projects" | "certifications";

export interface ExperienceEntry {
  title: string;
  company: string;
  /** `YYYY-MM` */
  start: string;
  /** `YYYY-MM`, or null for "Present" */
  end: string | null;
  bullets: string[];
}

export interface EducationEntry {
  degree: string;
  school: string;
  year?: string;
}

export interface ResumeSkill {
  name: string;
  /** A verbatim quote from the resume that supports this skill. */
  evidence: string;
  section: ResumeSection;
}

export interface StructuredResume {
  contact: { email: string; phone: string; location: string };
  summary: string;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  skills: ResumeSkill[];
}

export type ExtractionMethod = "text" | "ocr" | "mixed";

export interface ResumeFile {
  fileName: string;
  source: "resume_db";
  extractionMethod: ExtractionMethod;
  pageCount: number;
  rawText: string;
}

export interface Applicant {
  id: string;
  fullName: string;
  currentTitle: string;
  location: string;
  resume: StructuredResume;
  file: ResumeFile;
}

export type ReasonKind = "ok" | "warn" | "miss";

export interface MatchReason {
  kind: ReasonKind;
  text: string;
}

export interface MatchBreakdown {
  /** Each component is 0..1 before weighting. */
  must: number;
  experience: number;
  domain: number;
  nice: number;
}

export interface MatchEvidence {
  requirement: string;
  kind: "must" | "nice" | "domain";
  quote: string;
}

export interface MatchResult {
  score: number;
  breakdown: MatchBreakdown;
  matchedMust: string[];
  missingMust: string[];
  matchedNice: string[];
  matchedDomains: string[];
  years: number;
  reasons: MatchReason[];
  evidence: MatchEvidence[];
  scoringVersion: string;
}

export interface Application {
  id: string;
  applicantId: string;
  jobId: string;
  /** ISO timestamp */
  appliedAt: string;
  match: MatchResult;
}

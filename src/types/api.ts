import type { Applicant, Application } from "./applicant";
import type { Job } from "./job";
import type { ApplicationStatus, Decision } from "./review";

export interface JobSummary extends Job {
  counts: { to_review: number; shortlist: number; pass: number };
  storagePrefix: string | null;
}

export interface DeckCard {
  application: Application;
  applicant: Applicant;
  status: ApplicationStatus;
  /** When the resume landed in the resume database (ISO). */
  receivedAt: string;
}

export interface UndoEntry {
  reviewId: string;
  applicationId: string;
  decision: Decision;
  createdAt: string;
}

export type PipelineLevel = "db" | "txt" | "ocr" | "ok" | "err" | "dup" | "info";

export interface PipelineEvent {
  id: number;
  at: string;
  level: PipelineLevel;
  text: string;
}

export interface NeedsReviewItem {
  resumeId: string;
  fileName: string;
  jobTitle: string | null;
  reason: string;
  at: string;
}

export interface PipelineStatus {
  source: string;
  state: "live" | "paused" | "idle" | "offline" | "error";
  processed: number;
  total: number;
  lastSyncAt: string | null;
  lastError: string | null;
  events: PipelineEvent[];
  needsReview: NeedsReviewItem[];
}

export interface Me {
  userId: string;
  email: string;
  orgId: string;
  orgName: string;
  role: "admin" | "recruiter" | "viewer";
}

export type Decision = "shortlist" | "pass" | "reset";

export type ApplicationStatus = "to_review" | "shortlist" | "pass";

/** Append-only. An application's status is its latest review where `undoneAt` is null. */
export interface Review {
  id: string;
  applicationId: string;
  jobId: string;
  decision: Decision;
  /** ISO timestamp */
  createdAt: string;
  undoneAt: string | null;
}

export function statusFromDecision(decision: Decision | undefined): ApplicationStatus {
  if (decision === "shortlist" || decision === "pass") return decision;
  return "to_review";
}

"use client";

import Link from "next/link";
import { statusOf } from "@/lib/deck-reducer";
import { useDeck } from "@/lib/deck-store";
import { APPLICANTS_BY_ID, APPLICATIONS_BY_ID, JOBS_BY_ID } from "@/lib/mock-data";
import { ResumeDetail } from "./ResumeDetail";
import { Toast } from "./Toast";
import styles from "./ApplicantPageView.module.css";

export function ApplicantPageView({ applicationId }: { applicationId: string }) {
  const { state, decide, moveBack, undo, toast, dismissToast } = useDeck();
  const base = APPLICATIONS_BY_ID.get(applicationId)!;
  // Prefer the live copy (it carries the real arrival time once synced).
  const application = state.applications[applicationId] ?? base;
  const applicant = APPLICANTS_BY_ID.get(application.applicantId)!;
  const job = JOBS_BY_ID.get(application.jobId)!;
  const inSystem = !!state.applications[applicationId];
  const status = statusOf(state.reviews, applicationId);

  return (
    <>
      <Link href={`/jobs/${job.id}`} className={styles.back}>
        ← Back to {job.title} deck
      </Link>
      {!inSystem && (
        <p className={`post ${styles.pending}`}>This resume is still in the resume database queue and has not reached a deck yet.</p>
      )}
      <ResumeDetail
        application={application}
        applicant={applicant}
        job={job}
        status={status}
        onDecide={inSystem ? (d) => decide(applicationId, d) : undefined}
        onMoveBack={inSystem ? () => moveBack(applicationId) : undefined}
      />
      <Toast toast={toast} onUndo={undo} onDismiss={dismissToast} />
    </>
  );
}

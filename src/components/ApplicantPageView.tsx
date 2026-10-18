"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useDeck } from "@/lib/deck-store";
import type { DeckCard } from "@/types/api";
import type { Job } from "@/types/job";
import { ResumeDetail } from "./ResumeDetail";
import { Toast } from "./Toast";
import styles from "./ApplicantPageView.module.css";

export function ApplicantPageView({ card, job }: { card: DeckCard; job: Job }) {
  const { state, decide, moveBack, undo, watchJob, toast, dismissToast } = useDeck();
  const id = card.application.id;

  useEffect(() => {
    watchJob(job.id);
    return () => watchJob(null);
  }, [job.id, watchJob]);

  const application = state.applications[id] ?? card.application;
  const status = state.status[id] ?? card.status;
  const ready = !!state.loaded[job.id];

  return (
    <>
      <Link href={`/jobs/${job.id}`} className={styles.back}>
        ← Back to {job.title} deck
      </Link>
      <ResumeDetail
        application={application}
        applicant={card.applicant}
        job={job}
        status={status}
        onDecide={ready ? (d) => decide(job.id, id, d) : undefined}
        onMoveBack={ready ? () => moveBack(job.id, id) : undefined}
      />
      <Toast toast={toast} onUndo={(reviewId) => undo(job.id, reviewId)} onDismiss={dismissToast} />
    </>
  );
}

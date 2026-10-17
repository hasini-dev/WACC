"use client";

import Link from "next/link";
import { jobCounts } from "@/lib/deck-reducer";
import { useDeck } from "@/lib/deck-store";
import styles from "./JobDeckList.module.css";

export function JobDeckList({ selectedJobId }: { selectedJobId?: string }) {
  const { state } = useDeck();
  const jobs = state.jobs;
  return (
    <>
      <h2 className={styles.heading}>Job decks</h2>
      {jobs === null ? (
        <p className={styles.empty}>Loading decks…</p>
      ) : jobs.length === 0 ? (
        <p className={styles.empty}>No job folders yet. Each folder in the resume database becomes a deck.</p>
      ) : (
        <ul className={styles.list}>
          {jobs.map((job) => {
            const counts = jobCounts(state, job);
            const arrivals = state.arrivals[job.id] ?? 0;
            const selected = job.id === selectedJobId;
            return (
              <li key={job.id}>
                <Link
                  href={`/jobs/${job.id}`}
                  className={styles.job}
                  aria-current={selected ? "page" : undefined}
                  data-selected={selected || undefined}
                >
                  <span className={styles.title}>{job.title}</span>
                  <span className={styles.location}>{job.location || `${job.storagePrefix ?? ""}/`}</span>
                  <span className={styles.meta}>
                    <span>{counts.shortlist} shortlisted</span>
                    <span key={arrivals} className={styles.pill} data-pulse={arrivals > 0 || undefined}>
                      {counts.to_review}
                      <span className="sr-only"> left to review</span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

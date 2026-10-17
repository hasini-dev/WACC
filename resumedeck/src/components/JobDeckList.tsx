"use client";

import Link from "next/link";
import { applicationsWithStatus } from "@/lib/deck-reducer";
import { useDeck } from "@/lib/deck-store";
import { JOBS } from "@/lib/mock-data";
import styles from "./JobDeckList.module.css";

export function JobDeckList({ selectedJobId }: { selectedJobId?: string }) {
  const { state } = useDeck();
  return (
    <>
      <h2 className={styles.heading}>Job decks</h2>
      <ul className={styles.list}>
        {JOBS.map((job) => {
          const left = state.order[job.id]?.length ?? 0;
          const shortlisted = applicationsWithStatus(state, job.id, "shortlist").length;
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
                <span className={styles.location}>{job.location}</span>
                <span className={styles.meta}>
                  <span>{shortlisted} shortlisted</span>
                  <span key={arrivals} className={styles.pill} data-pulse={arrivals > 0 || undefined}>
                    {left}
                    <span className="sr-only"> left to review</span>
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

"use client";

import Link from "next/link";
import { jobCounts } from "@/lib/deck-reducer";
import { useDeck } from "@/lib/deck-store";
import { ClockTime } from "./TimeAgo";
import styles from "./DashboardView.module.css";

export function DashboardView() {
  const { state } = useDeck();
  const jobs = state.jobs ?? [];
  const needs = state.pipeline?.needsReview ?? [];
  const totalToReview = jobs.reduce((n, j) => n + jobCounts(state, j).to_review, 0);

  return (
    <div className={styles.stack}>
      <section className={`post ${styles.intro}`}>
        <h1 className={styles.h1}>Your decks</h1>
        <p>
          {state.jobs === null
            ? "Loading…"
            : `${totalToReview} applicant${totalToReview === 1 ? "" : "s"} to review across ${jobs.length} open role${jobs.length === 1 ? "" : "s"}. `}
          New resumes from the resume database are scored and dropped into the right deck automatically.
        </p>
      </section>

      {needs.length > 0 && (
        <section className={`post ${styles.needs}`} aria-labelledby="needs-heading">
          <h2 id="needs-heading" className={styles.h2}>
            Needs review <span className={styles.badge}>{needs.length}</span>
          </h2>
          <p className={styles.note}>These files could not be processed automatically and are kept out of every deck until a person checks them.</p>
          <ul>
            {needs.map((n) => (
              <li key={n.resumeId}>
                <span className={styles.file}>{n.fileName}</span>
                {n.jobTitle && <span className={styles.when}>{n.jobTitle}</span>}
                <span className={styles.reason}>{n.reason}</span>
                <span className={styles.when}>
                  <ClockTime iso={n.at} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {jobs.map((job) => {
        const c = jobCounts(state, job);
        return (
          <section key={job.id} className={`post ${styles.job}`} aria-labelledby={`dash-${job.id}`}>
            <div className={styles.jobHead}>
              <div>
                <h2 id={`dash-${job.id}`} className={styles.h2}>
                  {job.title}
                </h2>
                <p className={styles.note}>
                  {[job.location, job.minYears ? `${job.minYears}+ yrs` : "", job.storagePrefix ? `folder ${job.storagePrefix}/` : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Link href={`/jobs/${job.id}`} className={styles.open}>
                Open deck →
              </Link>
            </div>
            <dl className={styles.stats}>
              <div>
                <dt>To review</dt>
                <dd>{c.to_review}</dd>
              </div>
              <div>
                <dt>Shortlisted</dt>
                <dd>{c.shortlist}</dd>
              </div>
              <div>
                <dt>Passed</dt>
                <dd>{c.pass}</dd>
              </div>
            </dl>
            {c.to_review === 0 && <p className={styles.note}>Deck cleared — new applicants for this role will appear here as they arrive.</p>}
          </section>
        );
      })}
    </div>
  );
}

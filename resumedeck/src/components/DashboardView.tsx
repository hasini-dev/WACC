"use client";

import Link from "next/link";
import { applicationsWithStatus } from "@/lib/deck-reducer";
import { useDeck } from "@/lib/deck-store";
import { APPLICANTS_BY_ID, JOBS } from "@/lib/mock-data";
import { Avatar } from "./Avatar";
import { ClockTime } from "./TimeAgo";
import styles from "./DashboardView.module.css";

export function DashboardView() {
  const { state } = useDeck();
  const totalToReview = JOBS.reduce((n, j) => n + (state.order[j.id]?.length ?? 0), 0);

  return (
    <div className={styles.stack}>
      <section className={`post ${styles.intro}`}>
        <h1 className={styles.h1}>Your decks</h1>
        <p>
          {totalToReview} applicant{totalToReview === 1 ? "" : "s"} to review across {JOBS.length} open roles. New resumes
          from the resume database are scored and dropped into the right deck automatically.
        </p>
      </section>

      {state.needsReview.length > 0 && (
        <section className={`post ${styles.needs}`} aria-labelledby="needs-heading">
          <h2 id="needs-heading" className={styles.h2}>
            Needs review <span className={styles.badge}>{state.needsReview.length}</span>
          </h2>
          <p className={styles.note}>These files could not be processed automatically and are kept out of every deck.</p>
          <ul>
            {state.needsReview.map((n) => (
              <li key={n.fileName + n.at}>
                <span className={styles.file}>{n.fileName}</span>
                <span className={styles.reason}>{n.reason}</span>
                <span className={styles.when}>
                  <ClockTime iso={n.at} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {JOBS.map((job) => {
        const order = state.order[job.id] ?? [];
        const shortlisted = applicationsWithStatus(state, job.id, "shortlist").length;
        const passed = applicationsWithStatus(state, job.id, "pass").length;
        const preview = order.slice(0, 3).map((id) => state.applications[id]!).filter(Boolean);
        return (
          <section key={job.id} className={`post ${styles.job}`} aria-labelledby={`dash-${job.id}`}>
            <div className={styles.jobHead}>
              <div>
                <h2 id={`dash-${job.id}`} className={styles.h2}>
                  {job.title}
                </h2>
                <p className={styles.note}>
                  {job.location} · {job.minYears}+ yrs
                </p>
              </div>
              <Link href={`/jobs/${job.id}`} className={styles.open}>
                Open deck →
              </Link>
            </div>
            <dl className={styles.stats}>
              <div>
                <dt>To review</dt>
                <dd>{order.length}</dd>
              </div>
              <div>
                <dt>Shortlisted</dt>
                <dd>{shortlisted}</dd>
              </div>
              <div>
                <dt>Passed</dt>
                <dd>{passed}</dd>
              </div>
            </dl>
            {preview.length > 0 ? (
              <ul className={styles.preview} aria-label={`Top of the ${job.title} deck`}>
                {preview.map((app) => {
                  const ap = APPLICANTS_BY_ID.get(app.applicantId)!;
                  return (
                    <li key={app.id}>
                      <Avatar name={ap.fullName} seed={ap.id} size={32} />
                      <span className={styles.pname}>{ap.fullName}</span>
                      <span className={styles.pscore}>{app.match.score}%</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={styles.note}>Deck cleared — new applicants for this role will appear here as they arrive.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

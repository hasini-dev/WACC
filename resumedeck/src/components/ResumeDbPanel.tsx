"use client";

import { useDeck } from "@/lib/deck-store";
import { WEIGHTS } from "@/lib/match-scoring";
import { RESUME_DB_SOURCE } from "@/lib/mock-data";
import { ClockTime } from "./TimeAgo";
import styles from "./ResumeDbPanel.module.css";

export function ResumeDbPanel() {
  const { state, setSyncPaused, pullNext } = useDeck();
  const done = state.incoming.length === 0;
  const status = done ? "idle" : state.syncPaused ? "paused" : "live";
  const statusText = { live: "Syncing", paused: "Paused", idle: "Up to date" }[status];
  const pct = state.total ? Math.round((state.processed / state.total) * 100) : 100;

  return (
    <>
      <section className={`post ${styles.panel}`} aria-labelledby="db-heading">
        <div className={styles.head}>
          <h2 id="db-heading" className={styles.title}>
            Resume database
          </h2>
          <span className={styles.status} data-status={status}>
            <span className={styles.dot} aria-hidden="true" />
            {statusText}
          </span>
        </div>
        <p className={styles.source}>{RESUME_DB_SOURCE}</p>

        <div className={styles.progressRow}>
          <span>Files processed</span>
          <span>
            {state.processed} / {state.total}
          </span>
        </div>
        <div
          className={styles.bar}
          role="progressbar"
          aria-label="Files processed"
          aria-valuemin={0}
          aria-valuemax={state.total}
          aria-valuenow={state.processed}
        >
          <span style={{ width: `${pct}%` }} />
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btn}
            onClick={() => setSyncPaused(!state.syncPaused)}
            disabled={done}
            aria-pressed={state.syncPaused}
          >
            {state.syncPaused ? "Resume sync" : "Pause sync"}
          </button>
          <button type="button" className={styles.btn} onClick={pullNext} disabled={done}>
            Pull next file now
          </button>
        </div>

        <h3 className={styles.logHeading}>Activity</h3>
        <ol className={styles.log} aria-label="Pipeline activity log" tabIndex={0}>
          {state.log.map((e) => (
            <li key={e.id} data-level={e.level}>
              <span className={styles.time}>
                <ClockTime iso={e.at} />
              </span>
              <span className={styles.msg}>{e.text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className={`post ${styles.legend}`} aria-labelledby="legend-heading">
        <h2 id="legend-heading" className={styles.title}>
          How the match score works
        </h2>
        <ul>
          <li><b style={{ background: "var(--green)" }} />Must-have skills <span>{WEIGHTS.must}</span></li>
          <li><b style={{ background: "var(--blue)" }} />Years of experience <span>{WEIGHTS.experience}</span></li>
          <li><b style={{ background: "var(--purple)" }} />Domain background <span>{WEIGHTS.domain}</span></li>
          <li><b style={{ background: "var(--yellow)" }} />Nice-to-have skills <span>{WEIGHTS.nice}</span></li>
        </ul>
        <p>
          Skills count only when the resume quotes evidence for them. Names, age, school and address never feed the
          score. The score orders the deck; a person makes every decision.
        </p>
      </section>
    </>
  );
}

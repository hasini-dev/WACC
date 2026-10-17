"use client";

import { useDeck } from "@/lib/deck-store";
import { WEIGHTS } from "@/lib/match-scoring";
import { ClockTime } from "./TimeAgo";
import styles from "./ResumeDbPanel.module.css";

const STATUS_TEXT = {
  live: "Syncing",
  paused: "Paused",
  idle: "Up to date",
  offline: "Worker offline",
  error: "Sync error",
} as const;

export function ResumeDbPanel() {
  const { state, me, pipelineAction } = useDeck();
  const p = state.pipeline;
  const status = p?.state ?? "offline";
  const pct = p && p.total ? Math.round((p.processed / p.total) * 100) : 0;
  const canControl = me.role !== "viewer" && status !== "offline";

  return (
    <>
      <section className={`post ${styles.panel}`} aria-labelledby="db-heading">
        <div className={styles.head}>
          <h2 id="db-heading" className={styles.title}>
            Resume database
          </h2>
          <span className={styles.status} data-status={status}>
            <span className={styles.dot} aria-hidden="true" />
            {p ? STATUS_TEXT[status] : "Connecting…"}
          </span>
        </div>
        <p className={styles.source}>{p?.source ?? "…"}</p>
        {status === "offline" && p && (
          <p className={styles.note}>
            The background worker isn&apos;t running. Start it with <code>npm run worker</code>.
          </p>
        )}
        {p?.lastError && <p className={styles.note}>Last sync failed: {p.lastError}</p>}

        <div className={styles.progressRow}>
          <span>Files processed</span>
          <span>
            {p?.processed ?? 0} / {p?.total ?? 0}
          </span>
        </div>
        <div
          className={styles.bar}
          role="progressbar"
          aria-label="Files processed"
          aria-valuemin={0}
          aria-valuemax={p?.total ?? 0}
          aria-valuenow={p?.processed ?? 0}
        >
          <span style={{ width: `${pct}%` }} />
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btn}
            onClick={() => pipelineAction(status === "paused" ? "resume" : "pause")}
            disabled={!canControl}
            aria-pressed={status === "paused"}
          >
            {status === "paused" ? "Resume sync" : "Pause sync"}
          </button>
          <button type="button" className={styles.btn} onClick={() => pipelineAction("pull")} disabled={!canControl}>
            Pull next file now
          </button>
        </div>

        <h3 className={styles.logHeading}>Activity</h3>
        <ol className={styles.log} aria-label="Pipeline activity log" tabIndex={0}>
          {(p?.events ?? []).map((e) => (
            <li key={e.id} data-level={e.level}>
              <span className={styles.time}>
                <ClockTime iso={e.at} />
              </span>
              <span className={styles.msg}>{e.text}</span>
            </li>
          ))}
          {p && p.events.length === 0 && <li className={styles.msg}>No activity yet.</li>}
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

"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Applicant, Application } from "@/types/applicant";
import type { Job } from "@/types/job";
import { skillMatchesJob } from "@/lib/match-scoring";
import { MatchRing } from "./MatchRing";
import { TimeAgo } from "./TimeAgo";
import styles from "./ResumeCard.module.css";

/** Distance (px) past which a released drag commits the swipe. */
export const SWIPE_THRESHOLD = 110;
/** Movement (px) under which a press counts as a click. */
const CLICK_SLOP = 6;

export type SwipeDirection = "left" | "right";

export function hashtag(skill: string): string {
  return skill
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, "-")
    .replace(/^-|-$/g, "");
}

interface Props {
  application: Application;
  applicant: Applicant;
  job: Job;
  receivedAt?: string;
  isNew: boolean;
  /** Set by the parent to fly the card off in that direction. */
  exit: SwipeDirection | null;
  canUndo: boolean;
  onSwipe: (dir: SwipeDirection) => void;
  onOpen: () => void;
  onUndo: () => void;
}

export function ResumeCard({ application, applicant, job, receivedAt, isNew, exit, canUndo, onSwipe, onOpen, onUndo }: Props) {
  const [drag, setDrag] = useState({ dx: 0, dy: 0, active: false });
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const { match } = application;

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (exit || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, a, summary")) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ dx: 0, dy: 0, active: true });
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    setDrag({ dx: e.clientX - s.x, dy: (e.clientY - s.y) * 0.4, active: true });
  };

  const finish = (e: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    start.current = null;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!cancelled && Math.hypot(dx, dy) < CLICK_SLOP) {
      setDrag({ dx: 0, dy: 0, active: false });
      onOpen();
      return;
    }
    if (!cancelled && Math.abs(dx) > SWIPE_THRESHOLD) {
      // Keep the current offset; the exit transition continues from here.
      setDrag((d) => ({ ...d, active: false }));
      onSwipe(dx > 0 ? "right" : "left");
      return;
    }
    setDrag({ dx: 0, dy: 0, active: false });
  };

  const dir = exit === "right" ? 1 : exit === "left" ? -1 : 0;
  const transform = exit
    ? `translate(${dir * 140}%, ${drag.dy}px) rotate(${dir * 18}deg)`
    : `translate(${drag.dx}px, ${drag.dy}px) rotate(${drag.dx * 0.05}deg)`;
  const shortlistOpacity = exit === "right" ? 1 : Math.max(0, Math.min(1, drag.dx / SWIPE_THRESHOLD));
  const passOpacity = exit === "left" ? 1 : Math.max(0, Math.min(1, -drag.dx / SWIPE_THRESHOLD));

  const matchedSkills = applicant.resume.skills.filter((s) => skillMatchesJob(s.name, job));
  const topEducation = applicant.resume.education[0];

  return (
    <article
      className={`post ${styles.card}`}
      data-dragging={drag.active || undefined}
      data-exit={exit ?? undefined}
      style={{ transform }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, false)}
      onPointerCancel={(e) => finish(e, true)}
      aria-labelledby={`card-name-${application.id}`}
      data-testid="resume-card"
    >
      <span className={`${styles.stamp} ${styles.stampShortlist}`} style={{ opacity: shortlistOpacity }} aria-hidden="true">
        Shortlist
      </span>
      <span className={`${styles.stamp} ${styles.stampPass}`} style={{ opacity: passOpacity }} aria-hidden="true">
        Pass
      </span>

      <p className={styles.source}>
        via resume db · <span className={styles.file}>{applicant.file.fileName}</span>
        {receivedAt && (
          <>
            {" "}
            · <TimeAgo iso={receivedAt} />
          </>
        )}
        {isNew && <span className={styles.newBadge}>New</span>}
      </p>

      <div className={styles.top}>
        <div className={styles.who}>
          <h2 className={styles.name} id={`card-name-${application.id}`}>
            <button type="button" className={styles.nameBtn} onClick={onOpen}>
              {applicant.fullName}
            </button>
          </h2>
          <p className={styles.title}>{applicant.currentTitle}</p>
          <p className={styles.meta}>
            <span>{applicant.location}</span>
            <span>{match.years} yrs experience</span>
            {topEducation && <span>{topEducation.degree}</span>}
          </p>
        </div>
        <MatchRing score={match.score} label={`${match.score}% match for ${job.title}`} />
      </div>

      <ul className={styles.reasons} aria-label="Why this score">
        {match.reasons.map((r) => (
          <li key={r.text} data-kind={r.kind}>
            <span className={styles.marker} aria-hidden="true">
              {r.kind === "ok" ? "✓" : r.kind === "warn" ? "!" : "✕"}
            </span>
            <span className="sr-only">{r.kind === "ok" ? "Meets: " : r.kind === "warn" ? "Partly: " : "Misses: "}</span>
            {r.text}
          </li>
        ))}
      </ul>

      <ul className={styles.tags} aria-label="Skills">
        {matchedSkills.map((s) => (
          <li key={s.name} className={styles.tagMatch}>
            #{hashtag(s.name)}
          </li>
        ))}
        {match.missingMust.map((s) => (
          <li key={s} className={styles.tagMissing}>
            #no-{hashtag(s)}
          </li>
        ))}
      </ul>

      <footer className={styles.footer}>
        <span className={styles.footText}>
          <strong>{match.score}% match</strong> for {job.title}
        </span>
        <span className={styles.footBtns}>
          <button type="button" className={styles.iconBtn} data-kind="pass" onClick={() => onSwipe("left")} aria-label={`Pass on ${applicant.fullName}`}>
            ✕
          </button>
          <button type="button" className={styles.iconBtn} data-kind="undo" onClick={onUndo} disabled={!canUndo} aria-label="Undo last decision">
            ↶
          </button>
          <button type="button" className={styles.iconBtn} data-kind="shortlist" onClick={() => onSwipe("right")} aria-label={`Shortlist ${applicant.fullName}`}>
            ♥
          </button>
        </span>
      </footer>
    </article>
  );
}

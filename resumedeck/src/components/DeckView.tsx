"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { applicationsWithStatus, statusOf, undoStack } from "@/lib/deck-reducer";
import { useDeck } from "@/lib/deck-store";
import { APPLICANTS_BY_ID } from "@/lib/mock-data";
import type { Job } from "@/types/job";
import type { ApplicationStatus } from "@/types/review";
import { Avatar } from "./Avatar";
import { DetailModal } from "./DetailModal";
import { ResumeCard, type SwipeDirection } from "./ResumeCard";
import { ResumeDetail } from "./ResumeDetail";
import { ReviewedList } from "./ReviewedList";
import { SwipeControls } from "./SwipeControls";
import { Toast } from "./Toast";
import styles from "./DeckView.module.css";

const EXIT_MS = 280;

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

const TABS: Array<{ id: ApplicationStatus; label: string }> = [
  { id: "to_review", label: "To review" },
  { id: "shortlist", label: "Shortlisted" },
  { id: "pass", label: "Passed" },
];

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function DeckView({ job }: { job: Job }) {
  const { state, decide, moveBack, undo, undoLatest, markSeen, toast, dismissToast } = useDeck();
  const [tab, setTab] = useState<ApplicationStatus>("to_review");
  const [exiting, setExiting] = useState<{ id: string; dir: SwipeDirection } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const exitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const order = state.order[job.id] ?? [];
  const topId = order[0];
  const top = topId ? state.applications[topId] : undefined;
  const topApplicant = top ? APPLICANTS_BY_ID.get(top.applicantId) : undefined;
  const shortlisted = applicationsWithStatus(state, job.id, "shortlist");
  const passed = applicationsWithStatus(state, job.id, "pass");
  const canUndo = undoStack(state, job.id).length > 0;
  const counts: Record<ApplicationStatus, number> = { to_review: order.length, shortlist: shortlisted.length, pass: passed.length };

  useEffect(() => () => clearTimeout(exitTimer.current), []);

  const swipe = useCallback(
    (dir: SwipeDirection) => {
      if (!top || exiting) return;
      const decision = dir === "right" ? "shortlist" : "pass";
      if (reducedMotion) {
        decide(top.id, decision);
        return;
      }
      setExiting({ id: top.id, dir });
      exitTimer.current = setTimeout(() => {
        decide(top.id, decision);
        setExiting(null);
      }, EXIT_MS);
    },
    [top, exiting, reducedMotion, decide],
  );

  const handleUndo = useCallback(() => {
    if (exiting) return;
    undoLatest(job.id);
  }, [exiting, undoLatest, job.id]);

  const open = useCallback(
    (id: string) => {
      markSeen(id);
      setOpenId(id);
    },
    [markSeen],
  );

  // Global keyboard shortcuts. Ignored while typing, inside the tab list, or with the modal open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (openId || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      const target = e.target as HTMLElement | null;
      // Arrow keys belong to the tab list while it has focus.
      if (e.key.startsWith("Arrow") && target?.closest?.('[role="tablist"]')) return;
      const onControl = !!target?.closest?.("button, a, summary");

      if (e.key === "z" || e.key === "Z" || e.key === "Backspace") {
        e.preventDefault();
        handleUndo();
        return;
      }
      if (tab !== "to_review") return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        swipe("left");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        swipe("right");
      } else if (e.key === "Enter" && !onControl && top) {
        e.preventDefault();
        open(top.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId, tab, top, swipe, handleUndo, open]);

  const onTabKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const idx = TABS.findIndex((t) => t.id === tab);
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    else return;
    e.preventDefault();
    const t = TABS[next]!;
    setTab(t.id);
    document.getElementById(`tab-${t.id}`)?.focus();
  };

  const openApp = openId ? state.applications[openId] : undefined;
  const openApplicant = openApp ? APPLICANTS_BY_ID.get(openApp.applicantId) : undefined;
  const openStatus = openApp ? statusOf(state.reviews, openApp.id) : "to_review";
  const depth = Math.min(2, Math.max(0, order.length - 1));

  return (
    <>
      <section className={`post ${styles.header}`} aria-labelledby="job-title">
        <div className={styles.headerBody}>
          <h1 id="job-title" className={styles.jobTitle}>
            {job.title}
          </h1>
          <p className={styles.jobMeta}>
            <span>{job.location}</span>
            <span>{job.minYears}+ yrs</span>
          </p>
          <p className={styles.mustLabel}>Must-have</p>
          <ul className={styles.must}>
            {job.requirements.must_have.map((r) => (
              <li key={r.skill}>{r.skill}</li>
            ))}
          </ul>
        </div>
        <div role="tablist" aria-label="Applicants by status" className={styles.tabs}>
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className={styles.tab}
              onClick={() => setTab(t.id)}
              onKeyDown={onTabKey}
            >
              {t.label} <span className={styles.count}>{counts[t.id]}</span>
            </button>
          ))}
        </div>
      </section>

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className={styles.panel}>
        {tab === "to_review" &&
          (top && topApplicant ? (
            <>
              <div className={styles.deck}>
                <Avatar name={topApplicant.fullName} seed={topApplicant.id} size={64} />
                <div className={styles.stack} data-depth={depth}>
                  {depth >= 2 && <div className={`${styles.slab} ${styles.slab2}`} aria-hidden="true" />}
                  {depth >= 1 && <div className={`${styles.slab} ${styles.slab1}`} aria-hidden="true" />}
                  <ResumeCard
                    key={top.id}
                    application={top}
                    applicant={topApplicant}
                    job={job}
                    receivedAt={state.receivedAt[top.id]}
                    isNew={!state.seen[top.id]}
                    exit={exiting?.id === top.id ? exiting.dir : null}
                    canUndo={canUndo}
                    onSwipe={swipe}
                    onOpen={() => open(top.id)}
                    onUndo={handleUndo}
                  />
                </div>
              </div>
              <p className={styles.position} aria-live="off">
                1 of {order.length} to review
              </p>
            </>
          ) : (
            <div className={`post ${styles.empty}`}>
              <p className={styles.emptyTitle}>Deck cleared</p>
              <p>New applicants for this role will appear here as they arrive.</p>
            </div>
          ))}
        {tab === "to_review" && (
          <SwipeControls
            name={topApplicant?.fullName}
            disabled={!top || !!exiting}
            canUndo={canUndo && !exiting}
            onPass={() => swipe("left")}
            onShortlist={() => swipe("right")}
            onUndo={handleUndo}
          />
        )}
        {tab === "shortlist" && (
          <ReviewedList
            applications={shortlisted}
            emptyText="No one shortlisted yet. Swipe right or press → on a card to shortlist."
            onOpen={open}
            onMoveBack={moveBack}
          />
        )}
        {tab === "pass" && (
          <ReviewedList
            applications={passed}
            emptyText="No one passed yet. Swipe left or press ← on a card to pass."
            onOpen={open}
            onMoveBack={moveBack}
          />
        )}
      </div>

      <DetailModal
        open={!!openApp}
        labelledBy="modal-name"
        fullPageHref={openApp ? `/applicants/${openApp.applicantId}` : "#"}
        onClose={() => setOpenId(null)}
      >
        {openApp && openApplicant && (
          <ResumeDetail
            application={openApp}
            applicant={openApplicant}
            job={job}
            status={openStatus}
            titleId="modal-name"
            onDecide={(d) => {
              setOpenId(null);
              if (openApp.id === top?.id) swipe(d === "shortlist" ? "right" : "left");
              else decide(openApp.id, d);
            }}
            onMoveBack={() => {
              setOpenId(null);
              moveBack(openApp.id);
            }}
          />
        )}
      </DetailModal>

      <Toast toast={toast} onUndo={undo} onDismiss={dismissToast} />
    </>
  );
}

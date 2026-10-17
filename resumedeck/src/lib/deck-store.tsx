"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { deckReducer, initDeckState, undoStack, type DeckState } from "@/lib/deck-reducer";
import {
  APPLICANTS_BY_ID,
  APPLICATIONS_BY_ID,
  INCOMING_FILES,
  INITIAL_APPLICATIONS,
  JOBS_BY_ID,
} from "@/lib/mock-data";
import type { Applicant, Application } from "@/types/applicant";
import type { Review } from "@/types/review";

/** First simulated arrival, then one file per interval. */
const SYNC_FIRST_DELAY_MS = 6_000;
const SYNC_INTERVAL_MS = 12_000;

export interface Toast {
  id: number;
  text: string;
  reviewId: string;
}

interface DeckContextValue {
  state: DeckState;
  decide: (applicationId: string, decision: "shortlist" | "pass") => void;
  moveBack: (applicationId: string) => void;
  undo: (reviewId: string) => void;
  undoLatest: (jobId: string) => Review | undefined;
  markSeen: (applicationId: string) => void;
  setSyncPaused: (paused: boolean) => void;
  pullNext: () => void;
  toast: Toast | null;
  dismissToast: () => void;
}

const DeckContext = createContext<DeckContextValue | null>(null);

function newReviewId(): string {
  return `rev-${crypto.randomUUID()}`;
}

function applicantName(app: Application): string {
  return APPLICANTS_BY_ID.get(app.applicantId)?.fullName ?? "applicant";
}

function okLabel(app: Application): string {
  const job = JOBS_BY_ID.get(app.jobId);
  return `${applicantName(app)} → ${app.match.score}% vs "${job?.title ?? app.jobId}"`;
}

function createInitialState(): DeckState {
  const now = Date.now();
  const receivedAt: Record<string, string> = {};
  for (const a of INITIAL_APPLICATIONS) {
    receivedAt[a.id] = new Date(now - a.receivedMinutesAgo * 60_000).toISOString();
  }
  const recent = [...INITIAL_APPLICATIONS].sort((a, b) => b.receivedMinutesAgo - a.receivedMinutesAgo).slice(-4);
  const initialLog = recent.flatMap((a) => {
    const ap = APPLICANTS_BY_ID.get(a.applicantId)!;
    const at = receivedAt[a.id]!;
    return [
      { at, level: "db" as const, text: `DB fetched ${ap.file.fileName}` },
      { at, level: "txt" as const, text: `TXT extracted ${ap.file.rawText.length.toLocaleString("en-US")} chars · 4 sections` },
      { at, level: "ok" as const, text: `OK ${okLabel(a)}` },
    ];
  });
  // Anything older than half an hour has already been glanced at; newer files get the "New" badge.
  const seen = INITIAL_APPLICATIONS.filter((a) => a.receivedMinutesAgo > 30).map((a) => a.id);
  return initDeckState({ applications: INITIAL_APPLICATIONS, receivedAt, incoming: INCOMING_FILES, initialLog, seen });
}

export function DeckProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(deckReducer, undefined, createInitialState);
  const [toast, setToast] = useState<Toast | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const announce = useCallback((text: string) => {
    // Clear first so repeating the same message is still announced.
    setAnnouncement("");
    requestAnimationFrame(() => setAnnouncement(text));
  }, []);

  const decide = useCallback(
    (applicationId: string, decision: "shortlist" | "pass") => {
      const app = stateRef.current.applications[applicationId];
      if (!app) return;
      const reviewId = newReviewId();
      dispatch({ type: "decide", reviewId, applicationId, decision, now: new Date().toISOString() });
      const text = `${decision === "shortlist" ? "Shortlisted" : "Passed on"} ${applicantName(app)}`;
      setToast({ id: Date.now(), text, reviewId });
      announce(text);
    },
    [announce],
  );

  const moveBack = useCallback(
    (applicationId: string) => {
      const app = stateRef.current.applications[applicationId];
      if (!app) return;
      const reviewId = newReviewId();
      dispatch({ type: "reset", reviewId, applicationId, now: new Date().toISOString() });
      const text = `Moved ${applicantName(app)} back to the deck`;
      setToast({ id: Date.now(), text, reviewId });
      announce(text);
    },
    [announce],
  );

  const undo = useCallback(
    (reviewId: string) => {
      const review = stateRef.current.reviews.find((r) => r.id === reviewId && r.undoneAt === null);
      if (!review) return;
      dispatch({ type: "undo", reviewId, now: new Date().toISOString() });
      setToast(null);
      const app = stateRef.current.applications[review.applicationId];
      if (app) announce(`Undid ${review.decision === "reset" ? "move back" : review.decision} for ${applicantName(app)}`);
    },
    [announce],
  );

  const undoLatest = useCallback(
    (jobId: string) => {
      const latest = undoStack(stateRef.current, jobId)[0];
      if (latest) undo(latest.id);
      return latest;
    },
    [undo],
  );

  const pullNext = useCallback(() => {
    const next = stateRef.current.incoming[0];
    if (!next) return;
    const now = new Date().toISOString();
    if (next.kind === "corrupt") {
      dispatch({ type: "pullNext", now });
      return;
    }
    const base = APPLICATIONS_BY_ID.get(next.applicationId);
    if (!base) return;
    const app: Application = {
      id: base.id,
      applicantId: base.applicantId,
      jobId: base.jobId,
      appliedAt: now,
      match: base.match,
    };
    dispatch({ type: "pullNext", now, incomingApplication: app, label: okLabel(app) });
    const job = JOBS_BY_ID.get(app.jobId);
    announce(`New applicant for ${job?.title ?? "a job"}: ${applicantName(app)}`);
  }, [announce]);

  const markSeen = useCallback((applicationId: string) => dispatch({ type: "markSeen", applicationId }), []);
  const setSyncPaused = useCallback((paused: boolean) => dispatch({ type: "setSyncPaused", paused }), []);
  const dismissToast = useCallback(() => setToast(null), []);

  // Simulated resume-database sync: pull one file per interval until empty.
  const syncPaused = state.syncPaused;
  const hasIncoming = state.incoming.length > 0;
  useEffect(() => {
    if (syncPaused || !hasIncoming) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    const first = setTimeout(() => {
      pullNext();
      interval = setInterval(pullNext, SYNC_INTERVAL_MS);
    }, SYNC_FIRST_DELAY_MS);
    return () => {
      clearTimeout(first);
      if (interval) clearInterval(interval);
    };
  }, [syncPaused, hasIncoming, pullNext]);

  const value = useMemo<DeckContextValue>(
    () => ({ state, decide, moveBack, undo, undoLatest, markSeen, setSyncPaused, pullNext, toast, dismissToast }),
    [state, decide, moveBack, undo, undoLatest, markSeen, setSyncPaused, pullNext, toast, dismissToast],
  );

  return (
    <DeckContext.Provider value={value}>
      {children}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </DeckContext.Provider>
  );
}

export function useDeck(): DeckContextValue {
  const ctx = useContext(DeckContext);
  if (!ctx) throw new Error("useDeck must be used inside <DeckProvider>");
  return ctx;
}

export function getApplicant(id: string): Applicant | undefined {
  return APPLICANTS_BY_ID.get(id);
}

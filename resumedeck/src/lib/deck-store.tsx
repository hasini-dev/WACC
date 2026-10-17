"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { deckReducer, emptyDeckState, type DeckState } from "@/lib/deck-reducer";
import type { Applicant } from "@/types/applicant";
import type { DeckCard, JobSummary, Me, PipelineStatus, UndoEntry } from "@/types/api";

export const POLL_MS = 5_000;
const SEEN_KEY = "clicked.seen.v1";

export interface Toast {
  id: number;
  text: string;
  reviewId?: string;
  tone?: "error";
}

interface DeckContextValue {
  me: Me;
  state: DeckState;
  decide: (jobId: string, applicationId: string, decision: "shortlist" | "pass") => void;
  moveBack: (jobId: string, applicationId: string) => void;
  undo: (jobId: string, reviewId: string) => void;
  undoLatest: (jobId: string) => void;
  /** Register the job whose deck should be polled (the open deck page). */
  watchJob: (jobId: string | null) => void;
  seen: Record<string, true>;
  markSeen: (applicationId: string) => void;
  pipelineAction: (action: "pause" | "resume" | "pull") => void;
  loadApplicant: (applicantId: string) => Promise<DeckCard | null>;
  toast: Toast | null;
  dismissToast: () => void;
}

const DeckContext = createContext<DeckContextValue | null>(null);

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers }, cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

function readSeen(): Record<string, true> {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    return raw ? (Object.fromEntries((JSON.parse(raw) as string[]).map((id) => [id, true])) as Record<string, true>) : {};
  } catch {
    return {};
  }
}

export function DeckProvider({ me, children }: { me: Me; children: ReactNode }) {
  const [state, dispatch] = useReducer(deckReducer, undefined, emptyDeckState);
  const [toast, setToast] = useState<Toast | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [watchedJob, setWatchedJob] = useState<string | null>(null);
  const [seen, setSeen] = useState<Record<string, true>>({});
  const stateRef = useRef(state);
  const pending = useRef(0);
  /** Undos pressed while the review was still saving; sent once the real id arrives. */
  const pendingUndo = useRef(new Set<string>());
  const announcedArrivals = useRef<Record<string, number>>({});

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setSeen(readSeen()));
    return () => cancelAnimationFrame(raf);
  }, []);

  const announce = useCallback((text: string) => {
    setAnnouncement("");
    requestAnimationFrame(() => setAnnouncement(text));
  }, []);

  const name = (applicationId: string): string => {
    const app = stateRef.current.applications[applicationId];
    return (app && stateRef.current.applicants[app.applicantId]?.fullName) || "applicant";
  };

  // ─── Polling ──────────────────────────────────────────────────────────────
  const refreshDeck = useCallback(async (jobId: string) => {
    const [deck, stack] = await Promise.all([
      api<{ cards: DeckCard[] }>(`/api/jobs/${encodeURIComponent(jobId)}/deck?status=all`),
      api<{ reviews: UndoEntry[] }>(`/api/reviews/undo-stack?jobId=${encodeURIComponent(jobId)}`),
    ]);
    // Never apply a snapshot taken while one of our own writes was in flight.
    if (pending.current === 0) dispatch({ type: "deckLoaded", jobId, cards: deck.cards, undo: stack.reviews });
  }, []);

  const refreshShared = useCallback(async () => {
    const [jobs, pipeline] = await Promise.all([api<{ jobs: JobSummary[] }>("/api/jobs"), api<PipelineStatus>("/api/pipeline")]);
    dispatch({ type: "jobsLoaded", jobs: jobs.jobs });
    dispatch({ type: "pipelineLoaded", pipeline });
  }, []);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        await Promise.all([refreshShared(), watchedJob ? refreshDeck(watchedJob) : Promise.resolve()]);
      } catch {
        // Transient network errors: the next poll retries.
      }
    };
    void run();
    const id = setInterval(() => alive && void run(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [watchedJob, refreshDeck, refreshShared]);

  // Announce new arrivals in the open deck.
  useEffect(() => {
    if (!watchedJob) return;
    const n = state.arrivals[watchedJob] ?? 0;
    const prev = announcedArrivals.current[watchedJob] ?? 0;
    if (n > prev) announce(`${n - prev} new applicant${n - prev === 1 ? "" : "s"} added to this deck`);
    announcedArrivals.current[watchedJob] = n;
  }, [state.arrivals, watchedJob, announce]);

  // ─── Mutations (optimistic, rolled back on error) ─────────────────────────
  const mutate = useCallback(
    async (jobId: string, run: () => Promise<void>) => {
      const snapshot = stateRef.current;
      pending.current++;
      try {
        await run();
      } catch (err) {
        dispatch({ type: "restore", state: snapshot });
        setToast({ id: Date.now(), text: `Couldn't save: ${(err as Error).message}`, tone: "error" });
        announce(`Couldn't save: ${(err as Error).message}`);
      } finally {
        pending.current--;
        void refreshDeck(jobId).catch(() => undefined);
      }
    },
    [announce, refreshDeck],
  );

  const confirm = useCallback(async (jobId: string, tempId: string, review: UndoEntry) => {
    if (pendingUndo.current.delete(tempId)) {
      await api(`/api/reviews/${encodeURIComponent(review.reviewId)}/undo`, { method: "POST" });
      return;
    }
    dispatch({ type: "reviewConfirmed", jobId, tempId, review });
    setToast((t) => (t?.reviewId === tempId ? { ...t, reviewId: review.reviewId } : t));
  }, []);

  const decide = useCallback(
    (jobId: string, applicationId: string, decision: "shortlist" | "pass") => {
      if (stateRef.current.status[applicationId] !== "to_review") return;
      const tempId = `tmp-${crypto.randomUUID()}`;
      const temp: UndoEntry = { reviewId: tempId, applicationId, decision, createdAt: new Date().toISOString() };
      const text = `${decision === "shortlist" ? "Shortlisted" : "Passed on"} ${name(applicationId)}`;
      dispatch({ type: "decide", jobId, review: temp });
      setToast({ id: Date.now(), text, reviewId: tempId });
      announce(text);
      void mutate(jobId, async () => {
        const { review } = await api<{ review: UndoEntry }>("/api/reviews", { method: "POST", body: JSON.stringify({ applicationId, decision }) });
        await confirm(jobId, tempId, review);
      });
    },
    [announce, mutate, confirm],
  );

  const moveBack = useCallback(
    (jobId: string, applicationId: string) => {
      const tempId = `tmp-${crypto.randomUUID()}`;
      dispatch({ type: "reset", jobId, review: { reviewId: tempId, applicationId, decision: "reset", createdAt: new Date().toISOString() } });
      const text = `Moved ${name(applicationId)} back to the deck`;
      setToast({ id: Date.now(), text, reviewId: tempId });
      announce(text);
      void mutate(jobId, async () => {
        const { review } = await api<{ review: UndoEntry }>("/api/reviews", {
          method: "POST",
          body: JSON.stringify({ applicationId, decision: "reset" }),
        });
        await confirm(jobId, tempId, review);
      });
    },
    [announce, mutate, confirm],
  );

  const undo = useCallback(
    (jobId: string, reviewId: string) => {
      const entry = stateRef.current.undo[jobId]?.find((e) => e.reviewId === reviewId);
      if (!entry) return;
      dispatch({ type: "undo", jobId, reviewId });
      setToast(null);
      announce(`Undid ${entry.decision === "reset" ? "move back" : entry.decision} for ${name(entry.applicationId)}`);
      if (reviewId.startsWith("tmp-")) {
        // Still saving: `confirm` sends the undo once the server returns the real id.
        pendingUndo.current.add(reviewId);
        return;
      }
      void mutate(jobId, async () => {
        await api(`/api/reviews/${encodeURIComponent(reviewId)}/undo`, { method: "POST" });
      });
    },
    [announce, mutate],
  );

  const undoLatest = useCallback(
    (jobId: string) => {
      const latest = stateRef.current.undo[jobId]?.[0];
      if (latest) undo(jobId, latest.reviewId);
    },
    [undo],
  );

  const markSeen = useCallback((applicationId: string) => {
    setSeen((s) => {
      if (s[applicationId]) return s;
      const next = { ...s, [applicationId]: true as const };
      try {
        window.localStorage.setItem(SEEN_KEY, JSON.stringify(Object.keys(next).slice(-2000)));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }, []);

  const pipelineAction = useCallback(
    (action: "pause" | "resume" | "pull") => {
      void api("/api/pipeline", { method: "POST", body: JSON.stringify({ action }) })
        .then(() => refreshShared())
        .catch((err: Error) => setToast({ id: Date.now(), text: err.message, tone: "error" }));
      if (action === "pull") setTimeout(() => void refreshShared().catch(() => undefined), 1500);
    },
    [refreshShared],
  );

  const loadApplicant = useCallback(async (applicantId: string) => {
    try {
      const { card } = await api<{ card: DeckCard }>(`/api/applicants/${encodeURIComponent(applicantId)}`);
      return card;
    } catch {
      return null;
    }
  }, []);

  const watchJob = useCallback((jobId: string | null) => setWatchedJob(jobId), []);
  const dismissToast = useCallback(() => setToast(null), []);

  const value = useMemo<DeckContextValue>(
    () => ({ me, state, decide, moveBack, undo, undoLatest, watchJob, seen, markSeen, pipelineAction, loadApplicant, toast, dismissToast }),
    [me, state, decide, moveBack, undo, undoLatest, watchJob, seen, markSeen, pipelineAction, loadApplicant, toast, dismissToast],
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

export type { Applicant };

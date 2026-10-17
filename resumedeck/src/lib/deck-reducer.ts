import type { Application } from "@/types/applicant";
import { statusFromDecision, type ApplicationStatus, type Decision, type Review } from "@/types/review";
import type { IncomingFile } from "@/lib/mock-data";

export type LogLevel = "db" | "txt" | "ocr" | "ok" | "err" | "dup";

export interface LogEntry {
  id: number;
  at: string;
  level: LogLevel;
  text: string;
}

export interface NeedsReviewItem {
  fileName: string;
  reason: string;
  at: string;
}

export interface DeckState {
  applications: Record<string, Application>;
  /** Per job: application ids still to review, top card first. */
  order: Record<string, string[]>;
  /** Append-only review log. */
  reviews: Review[];
  /** When each application's file landed in the resume database (ISO). */
  receivedAt: Record<string, string>;
  seen: Record<string, true>;
  incoming: IncomingFile[];
  syncPaused: boolean;
  processed: number;
  total: number;
  log: LogEntry[];
  needsReview: NeedsReviewItem[];
  /** Per job: bumps each time a new applicant arrives (drives the pill pulse). */
  arrivals: Record<string, number>;
  seq: number;
}

export type DeckAction =
  | { type: "decide"; reviewId: string; applicationId: string; decision: Exclude<Decision, "reset">; now: string }
  | { type: "reset"; reviewId: string; applicationId: string; now: string }
  | { type: "undo"; reviewId: string; now: string }
  | { type: "markSeen"; applicationId: string }
  | { type: "setSyncPaused"; paused: boolean }
  | { type: "pullNext"; now: string; incomingApplication?: Application; label?: string };

export function compareApplications(a: Application, b: Application): number {
  if (b.match.score !== a.match.score) return b.match.score - a.match.score;
  return a.appliedAt.localeCompare(b.appliedAt);
}

/**
 * Insert by rank, but never at an index below `minIndex` — so a new arrival can
 * never replace the card the recruiter is currently looking at.
 */
export function insertByRank(
  order: string[],
  id: string,
  apps: Record<string, Application>,
  minIndex = 1,
): string[] {
  const app = apps[id];
  if (!app) return order;
  const without = order.filter((x) => x !== id);
  const start = Math.min(minIndex, without.length);
  let i = start;
  while (i < without.length) {
    const other = apps[without[i]!];
    if (other && compareApplications(app, other) < 0) break;
    i++;
  }
  return [...without.slice(0, i), id, ...without.slice(i)];
}

export function statusOf(reviews: Review[], applicationId: string): ApplicationStatus {
  for (let i = reviews.length - 1; i >= 0; i--) {
    const r = reviews[i]!;
    if (r.applicationId === applicationId && r.undoneAt === null) return statusFromDecision(r.decision);
  }
  return "to_review";
}

/** Most recent un-undone reviews for a job, newest first. */
export function undoStack(state: DeckState, jobId: string): Review[] {
  return state.reviews.filter((r) => r.jobId === jobId && r.undoneAt === null).reverse();
}

export function applicationsWithStatus(state: DeckState, jobId: string, status: Exclude<ApplicationStatus, "to_review">) {
  return Object.values(state.applications)
    .filter((a) => a.jobId === jobId && statusOf(state.reviews, a.id) === status)
    .sort(compareApplications);
}

function addLog(state: DeckState, entries: Array<Omit<LogEntry, "id">>): Pick<DeckState, "log" | "seq"> {
  let seq = state.seq;
  const added = entries.map((e) => ({ ...e, id: ++seq }));
  return { log: [...added.reverse(), ...state.log].slice(0, 60), seq };
}

export function initDeckState(params: {
  applications: Application[];
  receivedAt: Record<string, string>;
  incoming: IncomingFile[];
  initialLog: Array<Omit<LogEntry, "id">>;
  seen?: string[];
}): DeckState {
  const applications = Object.fromEntries(params.applications.map((a) => [a.id, a]));
  const order: Record<string, string[]> = {};
  for (const a of [...params.applications].sort(compareApplications)) {
    (order[a.jobId] ??= []).push(a.id);
  }
  const base: DeckState = {
    applications,
    order,
    reviews: [],
    receivedAt: params.receivedAt,
    seen: Object.fromEntries((params.seen ?? []).map((id) => [id, true as const])),
    incoming: params.incoming,
    syncPaused: false,
    processed: params.applications.length,
    total: params.applications.length + params.incoming.length,
    log: [],
    needsReview: [],
    arrivals: {},
    seq: 0,
  };
  return { ...base, ...addLog(base, params.initialLog) };
}

export function deckReducer(state: DeckState, action: DeckAction): DeckState {
  switch (action.type) {
    case "decide": {
      const app = state.applications[action.applicationId];
      if (!app || statusOf(state.reviews, app.id) !== "to_review") return state;
      const review: Review = {
        id: action.reviewId,
        applicationId: app.id,
        jobId: app.jobId,
        decision: action.decision,
        createdAt: action.now,
        undoneAt: null,
      };
      return {
        ...state,
        reviews: [...state.reviews, review],
        order: { ...state.order, [app.jobId]: (state.order[app.jobId] ?? []).filter((id) => id !== app.id) },
        seen: { ...state.seen, [app.id]: true },
      };
    }

    case "reset": {
      const app = state.applications[action.applicationId];
      if (!app || statusOf(state.reviews, app.id) === "to_review") return state;
      const review: Review = {
        id: action.reviewId,
        applicationId: app.id,
        jobId: app.jobId,
        decision: "reset",
        createdAt: action.now,
        undoneAt: null,
      };
      return {
        ...state,
        reviews: [...state.reviews, review],
        order: { ...state.order, [app.jobId]: insertByRank(state.order[app.jobId] ?? [], app.id, state.applications) },
      };
    }

    case "undo": {
      const idx = state.reviews.findIndex((r) => r.id === action.reviewId && r.undoneAt === null);
      if (idx < 0) return state;
      const target = state.reviews[idx]!;
      const before = statusOf(state.reviews, target.applicationId);
      const reviews = state.reviews.map((r, i) => (i === idx ? { ...r, undoneAt: action.now } : r));
      const after = statusOf(reviews, target.applicationId);
      let jobOrder = state.order[target.jobId] ?? [];
      if (before !== "to_review" && after === "to_review") {
        // Undoing a decision puts that card back on top of the deck.
        jobOrder = [target.applicationId, ...jobOrder.filter((id) => id !== target.applicationId)];
      } else if (before === "to_review" && after !== "to_review") {
        jobOrder = jobOrder.filter((id) => id !== target.applicationId);
      }
      return { ...state, reviews, order: { ...state.order, [target.jobId]: jobOrder } };
    }

    case "markSeen":
      if (state.seen[action.applicationId]) return state;
      return { ...state, seen: { ...state.seen, [action.applicationId]: true } };

    case "setSyncPaused":
      return { ...state, syncPaused: action.paused };

    case "pullNext": {
      const [file, ...rest] = state.incoming;
      if (!file) return state;
      const base = { ...state, incoming: rest, processed: state.processed + 1 };
      if (file.kind === "corrupt") {
        return {
          ...base,
          needsReview: [{ fileName: file.fileName, reason: file.reason, at: action.now }, ...state.needsReview],
          ...addLog(state, [
            { at: action.now, level: "db", text: `DB fetched ${file.fileName}` },
            { at: action.now, level: "err", text: `ERR ${file.fileName}: ${file.reason} → Needs review` },
          ]),
        };
      }
      const app = action.incomingApplication;
      if (!app || app.id !== file.applicationId) return state;
      const applications = { ...state.applications, [app.id]: app };
      return {
        ...base,
        applications,
        receivedAt: { ...state.receivedAt, [app.id]: action.now },
        order: { ...state.order, [app.jobId]: insertByRank(state.order[app.jobId] ?? [], app.id, applications) },
        arrivals: { ...state.arrivals, [app.jobId]: (state.arrivals[app.jobId] ?? 0) + 1 },
        ...addLog(state, [
          { at: action.now, level: "db", text: `DB fetched ${file.fileName}` },
          ...file.ocrPages.map((p) => ({ at: action.now, level: "ocr" as const, text: `OCR used on page ${p}` })),
          {
            at: action.now,
            level: "txt" as const,
            text: `TXT extracted ${file.chars.toLocaleString("en-US")} chars · ${file.sections} sections`,
          },
          { at: action.now, level: "ok" as const, text: `OK ${action.label ?? app.id}` },
        ]),
      };
    }
  }
}

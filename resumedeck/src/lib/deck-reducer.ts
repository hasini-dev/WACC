import type { Applicant, Application } from "@/types/applicant";
import type { DeckCard, JobSummary, PipelineStatus, UndoEntry } from "@/types/api";
import type { ApplicationStatus, Decision } from "@/types/review";

/**
 * Client view of the server's data plus optimistic updates. The server is the
 * source of truth (append-only reviews); this state only decides *order*: the
 * card on top never changes because of a refresh, undone cards return to the
 * top, and arrivals are inserted by rank from position 2 down.
 */
export interface DeckState {
  jobs: JobSummary[] | null;
  applications: Record<string, Application>;
  applicants: Record<string, Applicant>;
  status: Record<string, ApplicationStatus>;
  /** Per job: application ids still to review, top card first. */
  order: Record<string, string[]>;
  /** Per job: the current user's undoable reviews, newest first. */
  undo: Record<string, UndoEntry[]>;
  receivedAt: Record<string, string>;
  /** Status before a "move back to deck", so undoing it can be shown immediately. */
  resetPrev: Record<string, ApplicationStatus>;
  arrivals: Record<string, number>;
  loaded: Record<string, true>;
  pipeline: PipelineStatus | null;
}

export type DeckAction =
  | { type: "jobsLoaded"; jobs: JobSummary[] }
  | { type: "pipelineLoaded"; pipeline: PipelineStatus }
  | { type: "deckLoaded"; jobId: string; cards: DeckCard[]; undo: UndoEntry[] }
  | { type: "decide"; jobId: string; review: UndoEntry }
  | { type: "reset"; jobId: string; review: UndoEntry }
  | { type: "reviewConfirmed"; jobId: string; tempId: string; review: UndoEntry }
  | { type: "undo"; jobId: string; reviewId: string }
  | { type: "restore"; state: DeckState };

export const emptyDeckState = (): DeckState => ({
  jobs: null,
  applications: {},
  applicants: {},
  status: {},
  order: {},
  undo: {},
  receivedAt: {},
  resetPrev: {},
  arrivals: {},
  loaded: {},
  pipeline: null,
});

export function compareApplications(a: Application, b: Application): number {
  if (b.match.score !== a.match.score) return b.match.score - a.match.score;
  return a.appliedAt.localeCompare(b.appliedAt);
}

/** Insert by rank, never at an index below `minIndex`, so the top card is never replaced. */
export function insertByRank(order: string[], id: string, apps: Record<string, Application>, minIndex = 1): string[] {
  const app = apps[id];
  if (!app) return order;
  const without = order.filter((x) => x !== id);
  let i = Math.min(minIndex, without.length);
  while (i < without.length) {
    const other = apps[without[i]!];
    if (other && compareApplications(app, other) < 0) break;
    i++;
  }
  return [...without.slice(0, i), id, ...without.slice(i)];
}

export function applicationsWithStatus(state: DeckState, jobId: string, status: ApplicationStatus): Application[] {
  return Object.values(state.applications)
    .filter((a) => a.jobId === jobId && state.status[a.id] === status)
    .sort(compareApplications);
}

/** Counts for the rail: live local numbers once a job's deck is loaded, server counts before. */
export function jobCounts(state: DeckState, job: JobSummary) {
  if (!state.loaded[job.id]) return job.counts;
  return {
    to_review: state.order[job.id]?.length ?? 0,
    shortlist: applicationsWithStatus(state, job.id, "shortlist").length,
    pass: applicationsWithStatus(state, job.id, "pass").length,
  };
}

const statusFor = (d: Decision): ApplicationStatus => (d === "reset" ? "to_review" : d);

export function deckReducer(state: DeckState, action: DeckAction): DeckState {
  switch (action.type) {
    case "jobsLoaded":
      return { ...state, jobs: action.jobs };

    case "pipelineLoaded":
      return { ...state, pipeline: action.pipeline };

    case "restore":
      return action.state;

    case "deckLoaded": {
      const applications = { ...state.applications };
      const applicants = { ...state.applicants };
      const status = { ...state.status };
      const receivedAt = { ...state.receivedAt };
      let newArrivals = 0;
      for (const c of action.cards) {
        if (!applications[c.application.id] && state.loaded[action.jobId]) newArrivals++;
        applications[c.application.id] = c.application;
        // Keep a richer copy (with raw text) if we fetched one for the detail view.
        const prev = applicants[c.applicant.id];
        applicants[c.applicant.id] = prev?.file.rawText ? { ...c.applicant, file: prev.file } : c.applicant;
        status[c.application.id] = c.status;
        receivedAt[c.application.id] = c.receivedAt;
      }
      const serverToReview = action.cards.filter((c) => c.status === "to_review").map((c) => c.application.id);
      const keep = new Set(serverToReview);
      let order = (state.order[action.jobId] ?? []).filter((id) => keep.has(id));
      if (!state.loaded[action.jobId] || order.length === 0) {
        order = serverToReview;
      } else {
        for (const id of serverToReview) if (!order.includes(id)) order = insertByRank(order, id, applications);
      }
      return {
        ...state,
        applications,
        applicants,
        status,
        receivedAt,
        order: { ...state.order, [action.jobId]: order },
        undo: { ...state.undo, [action.jobId]: action.undo },
        loaded: { ...state.loaded, [action.jobId]: true },
        arrivals: newArrivals ? { ...state.arrivals, [action.jobId]: (state.arrivals[action.jobId] ?? 0) + newArrivals } : state.arrivals,
      };
    }

    case "decide": {
      const { applicationId } = action.review;
      if (state.status[applicationId] !== "to_review") return state;
      return {
        ...state,
        status: { ...state.status, [applicationId]: statusFor(action.review.decision) },
        order: { ...state.order, [action.jobId]: (state.order[action.jobId] ?? []).filter((id) => id !== applicationId) },
        undo: { ...state.undo, [action.jobId]: [action.review, ...(state.undo[action.jobId] ?? [])] },
      };
    }

    case "reset": {
      const { applicationId } = action.review;
      const prev = state.status[applicationId];
      if (!prev || prev === "to_review") return state;
      return {
        ...state,
        status: { ...state.status, [applicationId]: "to_review" },
        order: { ...state.order, [action.jobId]: insertByRank(state.order[action.jobId] ?? [], applicationId, state.applications) },
        undo: { ...state.undo, [action.jobId]: [action.review, ...(state.undo[action.jobId] ?? [])] },
        resetPrev: { ...state.resetPrev, [action.review.reviewId]: prev },
      };
    }

    case "reviewConfirmed": {
      const swap = (e: UndoEntry) => (e.reviewId === action.tempId ? action.review : e);
      const resetPrev = { ...state.resetPrev };
      if (resetPrev[action.tempId]) {
        resetPrev[action.review.reviewId] = resetPrev[action.tempId]!;
        delete resetPrev[action.tempId];
      }
      return { ...state, undo: { ...state.undo, [action.jobId]: (state.undo[action.jobId] ?? []).map(swap) }, resetPrev };
    }

    case "undo": {
      const entry = (state.undo[action.jobId] ?? []).find((e) => e.reviewId === action.reviewId);
      if (!entry) return state;
      const { applicationId } = entry;
      const undo = { ...state.undo, [action.jobId]: (state.undo[action.jobId] ?? []).filter((e) => e !== entry) };
      let jobOrder = (state.order[action.jobId] ?? []).filter((id) => id !== applicationId);
      let next: ApplicationStatus;
      if (entry.decision === "reset") {
        next = state.resetPrev[entry.reviewId] ?? state.status[applicationId] ?? "to_review";
        if (next === "to_review") jobOrder = insertByRank(jobOrder, applicationId, state.applications);
      } else {
        // Undoing a decision puts that card back on top of the deck.
        next = "to_review";
        jobOrder = [applicationId, ...jobOrder];
      }
      return { ...state, undo, status: { ...state.status, [applicationId]: next }, order: { ...state.order, [action.jobId]: jobOrder } };
    }
  }
}

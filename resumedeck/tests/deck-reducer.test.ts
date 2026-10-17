import { describe, expect, it } from "vitest";
import { applicationsWithStatus, deckReducer, emptyDeckState, type DeckState } from "@/lib/deck-reducer";
import type { Applicant, Application } from "@/types/applicant";
import type { DeckCard, UndoEntry } from "@/types/api";
import type { ApplicationStatus } from "@/types/review";

const JOB = "job-1";
const T = "2026-10-01T12:00:00.000Z";

function card(id: string, score: number, status: ApplicationStatus = "to_review", appliedAt = "2026-10-01T00:00:00.000Z"): DeckCard {
  const application: Application = {
    id,
    applicantId: `apl-${id}`,
    jobId: JOB,
    appliedAt,
    match: {
      score,
      breakdown: { must: 0, experience: 0, domain: 0, nice: 0 },
      matchedMust: [],
      missingMust: [],
      matchedNice: [],
      matchedDomains: [],
      years: 0,
      reasons: [],
      evidence: [],
      scoringVersion: "v1",
    },
  };
  const applicant = {
    id: `apl-${id}`,
    fullName: id,
    currentTitle: "",
    location: "",
    resume: { contact: { email: "", phone: "", location: "" }, summary: "", experience: [], education: [], skills: [] },
    file: { fileName: `${id}.pdf`, source: "resume_db", extractionMethod: "text", pageCount: 1, rawText: "" },
  } satisfies Applicant;
  return { application, applicant, status, receivedAt: T };
}

const load = (s: DeckState, cards: DeckCard[], undo: UndoEntry[] = []) => deckReducer(s, { type: "deckLoaded", jobId: JOB, cards, undo });
const entry = (id: string, decision: UndoEntry["decision"], reviewId = `r-${id}`): UndoEntry => ({ reviewId, applicationId: id, decision, createdAt: T });
const base = () => load(emptyDeckState(), [card("a", 90), card("b", 70), card("c", 50)]);

describe("deck reducer", () => {
  it("first load sorts by server order (score desc, then applied date)", () => {
    const s = load(emptyDeckState(), [card("top", 95), card("early", 80, "to_review", "2026-10-01T01:00:00Z"), card("late", 80, "to_review", "2026-10-01T05:00:00Z")]);
    expect(s.order[JOB]).toEqual(["top", "early", "late"]);
  });

  it("decide removes the card and pushes onto the undo stack", () => {
    const s = deckReducer(base(), { type: "decide", jobId: JOB, review: entry("a", "shortlist") });
    expect(s.order[JOB]).toEqual(["b", "c"]);
    expect(s.status.a).toBe("shortlist");
    expect(applicationsWithStatus(s, JOB, "shortlist").map((x) => x.id)).toEqual(["a"]);
    expect(s.undo[JOB]?.[0]?.reviewId).toBe("r-a");
  });

  it("undo puts the card back on top", () => {
    let s = deckReducer(base(), { type: "decide", jobId: JOB, review: entry("a", "shortlist") });
    s = deckReducer(s, { type: "decide", jobId: JOB, review: entry("b", "pass") });
    s = deckReducer(s, { type: "undo", jobId: JOB, reviewId: "r-b" });
    expect(s.order[JOB]).toEqual(["b", "c"]);
    expect(s.undo[JOB]?.map((e) => e.reviewId)).toEqual(["r-a"]);
  });

  it("a refresh with a new, higher-scoring arrival never replaces the top card", () => {
    const s = load(base(), [card("n", 99), card("a", 90), card("b", 70), card("c", 50)]);
    expect(s.order[JOB]).toEqual(["a", "n", "b", "c"]);
    expect(s.arrivals[JOB]).toBe(1);
  });

  it("a refresh keeps an undone card on top even if it ranks lower", () => {
    let s = deckReducer(base(), { type: "decide", jobId: JOB, review: entry("c", "pass") });
    s = deckReducer(s, { type: "undo", jobId: JOB, reviewId: "r-c" });
    s = load(s, [card("a", 90), card("b", 70), card("c", 50)]);
    expect(s.order[JOB]).toEqual(["c", "a", "b"]);
  });

  it("decisions made elsewhere (another browser) drop the card on refresh", () => {
    const s = load(base(), [card("a", 90, "shortlist"), card("b", 70), card("c", 50)]);
    expect(s.order[JOB]).toEqual(["b", "c"]);
    expect(s.status.a).toBe("shortlist");
  });

  it("move back to deck inserts by rank from position 2, and undoing it restores the old status", () => {
    let s = deckReducer(base(), { type: "decide", jobId: JOB, review: entry("a", "shortlist") });
    s = deckReducer(s, { type: "reset", jobId: JOB, review: entry("a", "reset", "r-reset") });
    expect(s.order[JOB]).toEqual(["b", "a", "c"]);
    s = deckReducer(s, { type: "undo", jobId: JOB, reviewId: "r-reset" });
    expect(s.status.a).toBe("shortlist");
    expect(s.order[JOB]).toEqual(["b", "c"]);
  });

  it("reviewConfirmed swaps the temporary id for the server id", () => {
    let s = deckReducer(base(), { type: "decide", jobId: JOB, review: entry("a", "pass", "tmp-1") });
    s = deckReducer(s, { type: "reviewConfirmed", jobId: JOB, tempId: "tmp-1", review: entry("a", "pass", "rev_real") });
    expect(s.undo[JOB]?.[0]?.reviewId).toBe("rev_real");
  });

  it("ignores a decision on a card that is not to review", () => {
    const s1 = deckReducer(base(), { type: "decide", jobId: JOB, review: entry("a", "shortlist") });
    expect(deckReducer(s1, { type: "decide", jobId: JOB, review: entry("a", "pass", "dupe") })).toBe(s1);
  });

  it("restore rolls back to a snapshot", () => {
    const before = base();
    const after = deckReducer(before, { type: "decide", jobId: JOB, review: entry("a", "shortlist") });
    expect(deckReducer(after, { type: "restore", state: before })).toBe(before);
  });
});

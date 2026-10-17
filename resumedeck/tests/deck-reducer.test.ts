import { describe, expect, it } from "vitest";
import {
  applicationsWithStatus,
  deckReducer,
  initDeckState,
  statusOf,
  undoStack,
  type DeckState,
} from "@/lib/deck-reducer";
import type { Application } from "@/types/applicant";

const JOB = "job-1";
const NOW = "2026-10-01T12:00:00.000Z";

function app(id: string, score: number, appliedAt = "2026-10-01T00:00:00.000Z"): Application {
  return {
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
}

function setup(apps = [app("a", 90), app("b", 70), app("c", 50)]): DeckState {
  return initDeckState({
    applications: apps,
    receivedAt: {},
    incoming: [{ kind: "resume", applicationId: "n", fileName: "n.pdf", chars: 900, sections: 4, ocrPages: [] }],
    initialLog: [],
  });
}

const decide = (s: DeckState, id: string, decision: "shortlist" | "pass", reviewId = `r-${id}`) =>
  deckReducer(s, { type: "decide", reviewId, applicationId: id, decision, now: NOW });

describe("deck reducer", () => {
  it("sorts the deck by score desc, then applied date", () => {
    const s = setup([app("late", 80, "2026-10-01T05:00:00Z"), app("top", 95), app("early", 80, "2026-10-01T01:00:00Z")]);
    expect(s.order[JOB]).toEqual(["top", "early", "late"]);
  });

  it("shortlisting removes the card and records an append-only review", () => {
    const s = decide(setup(), "a", "shortlist");
    expect(s.order[JOB]).toEqual(["b", "c"]);
    expect(statusOf(s.reviews, "a")).toBe("shortlist");
    expect(applicationsWithStatus(s, JOB, "shortlist").map((x) => x.id)).toEqual(["a"]);
  });

  it("undo puts the card back on top and keeps the review row (with undoneAt)", () => {
    let s = decide(setup(), "a", "shortlist");
    s = decide(s, "b", "pass");
    s = deckReducer(s, { type: "undo", reviewId: "r-b", now: NOW });
    expect(s.order[JOB]).toEqual(["b", "c"]);
    expect(s.reviews).toHaveLength(2);
    expect(s.reviews[1]!.undoneAt).toBe(NOW);
    expect(undoStack(s, JOB).map((r) => r.id)).toEqual(["r-a"]);
  });

  it("new arrivals never replace the top card, even with a higher score", () => {
    const s = deckReducer(setup(), { type: "pullNext", now: NOW, incomingApplication: app("n", 99) });
    expect(s.order[JOB]).toEqual(["a", "n", "b", "c"]);
    expect(s.arrivals[JOB]).toBe(1);
  });

  it("an arrival into an empty deck becomes the top card", () => {
    let s = setup([app("a", 90)]);
    s = decide(s, "a", "pass");
    s = deckReducer(s, { type: "pullNext", now: NOW, incomingApplication: app("n", 10) });
    expect(s.order[JOB]).toEqual(["n"]);
  });

  it("move back to deck inserts by rank from position 2 and is undoable", () => {
    let s = decide(setup(), "a", "shortlist");
    s = deckReducer(s, { type: "reset", reviewId: "r-reset", applicationId: "a", now: NOW });
    expect(s.order[JOB]).toEqual(["b", "a", "c"]);
    expect(statusOf(s.reviews, "a")).toBe("to_review");
    s = deckReducer(s, { type: "undo", reviewId: "r-reset", now: NOW });
    expect(statusOf(s.reviews, "a")).toBe("shortlist");
    expect(s.order[JOB]).toEqual(["b", "c"]);
  });

  it("ignores a decision on a card that is not in the deck", () => {
    const s1 = decide(setup(), "a", "shortlist");
    const s2 = decide(s1, "a", "pass", "dupe");
    expect(s2).toBe(s1);
  });

  it("corrupt files land in needs review, never in a deck", () => {
    const s = deckReducer(
      { ...setup(), incoming: [{ kind: "corrupt", fileName: "bad.pdf", reason: "Corrupt PDF" }] },
      { type: "pullNext", now: NOW },
    );
    expect(s.needsReview).toEqual([{ fileName: "bad.pdf", reason: "Corrupt PDF", at: NOW }]);
    expect(s.order[JOB]).toEqual(["a", "b", "c"]);
    expect(s.log[0]!.level).toBe("err");
  });
});

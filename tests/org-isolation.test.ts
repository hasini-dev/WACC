import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Me } from "@/types/api";

// Org scoping is the local stand-in for Postgres RLS: a member of org B must not
// be able to read or change anything in org A.
describe("org isolation", () => {
  let repo: typeof import("@/lib/repo");
  let db: typeof import("@/lib/db");
  let alice: Me;
  let bob: Me;
  let viewer: Me;
  let appA: string;
  let jobA: string;
  let applicantA: string;

  beforeAll(async () => {
    process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "clicked-rls-"));
    repo = await import("@/lib/repo");
    db = await import("@/lib/db");
    const conn = db.db();
    conn.prepare("insert into organizations (id, name) values ('org_a', 'A'), ('org_b', 'B')").run();
    repo.addMember("org_a", "u_alice", "alice@a.test", "recruiter");
    repo.addMember("org_a", "u_vic", "vic@a.test", "viewer");
    repo.addMember("org_b", "u_bob", "bob@b.test", "admin");
    alice = repo.memberForUser("u_alice", "alice@a.test")!;
    viewer = repo.memberForUser("u_vic", "vic@a.test")!;
    bob = repo.memberForUser("u_bob", "bob@b.test")!;

    jobA = repo.createJob("org_a", "backend", {
      title: "Backend",
      location: "",
      minYears: 1,
      requirements: { must_have: [{ skill: "Java", aliases: [], weight: 1 }], nice_to_have: [], domains: [] },
    }).id;
    const resumeId = repo.insertPendingResume("org_a", { storagePath: "backend/a.pdf", sha: "sha-a", bytes: 10 });
    const saved = repo.saveProcessedResume("org_a", {
      resumeId,
      jobId: jobA,
      fullName: "Ann A",
      currentTitle: "Dev",
      structured: {
        contact: { email: "ann@x.test", phone: "", location: "" },
        summary: "",
        experience: [{ title: "Dev", company: "X", start: "2020-01", end: null, bullets: ["Java"] }],
        education: [],
        skills: [{ name: "Java", evidence: "Java", section: "skills" }],
      },
      rawText: "Ann A\nJava",
      sections: {},
      method: "text",
      pageCount: 1,
      ocrConfidence: null,
      status: "extracted",
      reviewReasons: [],
      model: null,
    });
    appA = saved.applicationId;
    applicantA = saved.applicantId;
    repo.scoreApplication("org_a", appA);
  });

  it("org A's member sees org A's data", () => {
    expect(repo.listJobs(alice.orgId)).toHaveLength(1);
    expect(repo.deck(alice.orgId, jobA, "to_review")).toHaveLength(1);
    expect(repo.applicantDetail(alice.orgId, applicantA)?.applicant.fullName).toBe("Ann A");
  });

  it("org B can't list, read or open org A's jobs, decks or applicants", () => {
    expect(repo.listJobs(bob.orgId)).toEqual([]);
    expect(repo.getJob(bob.orgId, jobA)).toBeNull();
    expect(repo.deck(bob.orgId, jobA, "all")).toEqual([]);
    expect(repo.applicantDetail(bob.orgId, applicantA)).toBeNull();
    expect(repo.needsReview(bob.orgId)).toEqual([]);
  });

  it("org B can't review or undo in org A, even as an admin", () => {
    expect(() => repo.createReview(bob, appA, "shortlist")).toThrow(/not found/i);
    const r = repo.createReview(alice, appA, "shortlist");
    expect(() => repo.undoReview(bob, r.reviewId)).toThrow(/not found/i);
    expect(repo.undoStack(bob, jobA)).toEqual([]);
    repo.undoReview(alice, r.reviewId);
  });

  it("viewers can't review; only the reviewer or an admin can undo", () => {
    expect(() => repo.createReview(viewer, appA, "pass")).toThrow(/Viewers/);
    const r = repo.createReview(alice, appA, "pass");
    expect(() => repo.undoReview(viewer, r.reviewId)).toThrow(/reviewer or an admin/);
    repo.undoReview(alice, r.reviewId);
  });

  it("reviews are append-only at the database level", () => {
    const r = repo.createReview(alice, appA, "shortlist");
    const conn = db.db();
    expect(() => conn.prepare("update reviews set decision = 'pass' where id = ?").run(r.reviewId)).toThrow(/append-only/);
    expect(() => conn.prepare("delete from reviews where id = ?").run(r.reviewId)).toThrow(/append-only/);
    repo.undoReview(alice, r.reviewId);
    expect(() => repo.undoReview(alice, r.reviewId)).toThrow(/Already undone/);
  });

  it("rescoring adds a new match_scores row instead of editing the old one", () => {
    const before = db.db().prepare("select count(*) as n from match_scores where application_id = ?").get(appA) as { n: number };
    repo.scoreApplication("org_a", appA);
    const after = db.db().prepare("select count(*) as n from match_scores where application_id = ?").get(appA) as { n: number };
    expect(Number(after.n)).toBe(Number(before.n) + 1);
  });
});

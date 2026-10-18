import { describe, expect, it } from "vitest";
import { canonicalSkill, scoreResume, totalYears, type ScoringInput } from "@/lib/match-scoring";
import { APPLICANTS, APPLICATIONS_BY_ID, JOBS, JOBS_BY_ID, MOCK_NOW } from "@/lib/mock-data";
import type { Job } from "@/types/job";

const job: Job = JOBS_BY_ID.get("job-backend-java")!;
const NOW = new Date("2026-10-01T00:00:00Z");

function input(overrides: Partial<ScoringInput> = {}): ScoringInput {
  return {
    summary: "Backend engineer in payroll.",
    experience: [{ title: "Engineer", company: "Acme Payments", start: "2020-10", end: null, bullets: ["Built things"] }],
    skills: ["Java", "Spring Boot", "REST API", "SQL", "Microservices"].map((name) => ({
      name,
      evidence: `Used ${name} daily`,
      section: "skills" as const,
    })),
    ...overrides,
  };
}

describe("scoreResume (v1 formula)", () => {
  it("applies round(must*40 + experience*25 + domain*20 + nice*15)", () => {
    const r = scoreResume(input(), job, NOW);
    // all 5 must (40) + 6 yrs ≥ 5 (25) + payroll & payments = 2 domains (20) + 0 nice
    expect(r.breakdown).toEqual({ must: 1, experience: 1, domain: 1, nice: 0 });
    expect(r.score).toBe(85);
    expect(r.scoringVersion).toBe("v1");
  });

  it("only counts a skill when it carries an evidence quote", () => {
    const skills = input().skills.map((s) => (s.name === "Microservices" ? { ...s, evidence: "  " } : s));
    const r = scoreResume(input({ skills }), job, NOW);
    expect(r.missingMust).toEqual(["Microservices"]);
    expect(r.breakdown.must).toBeCloseTo(0.8);
  });

  it("normalizes aliases", () => {
    expect(canonicalSkill("RESTful")).toBe("rest api");
    expect(canonicalSkill("k8s")).toBe("kubernetes");
    expect(canonicalSkill("Spring")).toBe("spring boot");
    expect(canonicalSkill("PostgreSQL")).toBe("sql");
  });

  it("merges overlapping date ranges and treats null end as now", () => {
    const years = totalYears(
      [
        { title: "a", company: "x", start: "2020-01", end: "2022-01", bullets: [] },
        { title: "b", company: "y", start: "2021-01", end: "2023-01", bullets: [] }, // overlaps a
        { title: "c", company: "z", start: "2025-10", end: null, bullets: [] },
      ],
      NOW,
    );
    expect(years).toBe(4); // 2020-01..2023-01 (3y) + 2025-10..2026-10 (1y)
  });

  it("is deterministic", () => {
    const scores = [1, 2, 3].map(() => scoreResume(input(), job, NOW));
    expect(scores[1]).toEqual(scores[0]);
    expect(scores[2]).toEqual(scores[0]);
  });

  it("ignores identity fields: name, contact, education never reach the scorer", () => {
    // The scorer only accepts ScoringInput; build it from two applicants that differ
    // only in name, contact and school and confirm identical scores.
    const base = APPLICANTS.find((a) => a.id === "apl-marcus-bell")!;
    const swapped = {
      ...base,
      fullName: "Maria Bellini",
      resume: {
        ...base.resume,
        contact: { email: "m@example.org", phone: "000", location: "Elsewhere" },
        education: [{ degree: "B.A.", school: "Some Other College", year: "1999" }],
      },
    };
    const toInput = (a: typeof base): ScoringInput => ({
      summary: a.resume.summary,
      experience: a.resume.experience,
      skills: a.resume.skills,
    });
    expect(scoreResume(toInput(swapped), job, NOW)).toEqual(scoreResume(toInput(base), job, NOW));
  });
});

describe("mock data", () => {
  const apps = [...APPLICATIONS_BY_ID.values()];

  it("has 3 jobs and 14 applicants", () => {
    expect(JOBS).toHaveLength(3);
    expect(APPLICANTS).toHaveLength(14);
  });

  it("has a strong (≥85), medium (50–80) and weak (<45) candidate for every job", () => {
    for (const j of JOBS) {
      const scores = apps.filter((a) => a.jobId === j.id).map((a) => a.match.score);
      expect(scores.some((s) => s >= 85), `${j.id} strong`).toBe(true);
      expect(scores.some((s) => s >= 50 && s <= 80), `${j.id} medium`).toBe(true);
      expect(scores.some((s) => s < 45), `${j.id} weak`).toBe(true);
    }
  });

  it("every skill evidence quote appears verbatim in the resume text", () => {
    for (const a of APPLICANTS) {
      for (const s of a.resume.skills) {
        expect(a.file.rawText, `${a.id} / ${s.name}`).toContain(s.evidence);
      }
    }
  });

  it("scores match a fresh computation", () => {
    for (const app of apps) {
      const ap = APPLICANTS.find((a) => a.id === app.applicantId)!;
      const { summary, experience, skills } = ap.resume;
      expect(scoreResume({ summary, experience, skills }, JOBS_BY_ID.get(app.jobId)!, MOCK_NOW)).toEqual(app.match);
    }
  });
});

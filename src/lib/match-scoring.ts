import type { ExperienceEntry, MatchEvidence, MatchReason, MatchResult, ResumeSkill } from "@/types/applicant";
import type { Job, SkillRequirement } from "@/types/job";

export const SCORING_VERSION = "v1";

export const WEIGHTS = { must: 40, experience: 25, domain: 20, nice: 15 } as const;

/**
 * The only resume fields scoring may see. Name, contact details, education
 * (school, graduation year) and photos are excluded by type so they can never
 * become inputs.
 */
export interface ScoringInput {
  summary: string;
  experience: ExperienceEntry[];
  skills: ResumeSkill[];
}

/** canonical name -> known aliases (all compared after `normalizeTerm`). */
const ALIASES: Record<string, string[]> = {
  "spring boot": ["spring", "springboot", "spring framework"],
  "rest api": ["rest", "restful", "restful api", "restful apis", "rest apis", "rest services"],
  microservices: ["microservice", "micro services", "microservice architecture"],
  kubernetes: ["k8s", "eks", "gke"],
  aws: ["amazon web services"],
  sql: ["postgresql", "postgres", "mysql", "t-sql", "tsql", "pl/sql"],
  javascript: ["js", "es6"],
  "power bi": ["powerbi"],
  "a/b testing": ["ab testing", "a/b tests", "experimentation", "split testing"],
  statistics: ["statistical analysis", "stats", "regression analysis"],
  "user research": ["ux research", "user interviews"],
  prototyping: ["prototypes", "interactive prototypes"],
  "design systems": ["design system", "component libraries", "component library"],
  "usability testing": ["usability tests", "usability studies"],
  accessibility: ["a11y", "wcag"],
  motion: ["motion design", "animation", "micro-interactions"],
};

export function normalizeTerm(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9+#/\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CANONICAL = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(ALIASES)) {
  CANONICAL.set(canonical, canonical);
  for (const alias of aliases) CANONICAL.set(normalizeTerm(alias), canonical);
}

export function canonicalSkill(term: string): string {
  const n = normalizeTerm(term);
  return CANONICAL.get(n) ?? n;
}

function requirementTerms(req: SkillRequirement): Set<string> {
  return new Set([req.skill, ...req.aliases].map(canonicalSkill));
}

/** A requirement is met only by a resume skill that carries an evidence quote. */
function findSkill(req: SkillRequirement, skills: ResumeSkill[]): ResumeSkill | undefined {
  const terms = requirementTerms(req);
  return skills.find((s) => s.evidence.trim().length > 0 && terms.has(canonicalSkill(s.name)));
}

function monthIndex(yyyyMm: string): number {
  const [y, m] = yyyyMm.split("-").map(Number);
  return (y ?? 0) * 12 + ((m ?? 1) - 1);
}

/** Total years across non-overlapping date ranges. `end: null` means present. */
export function totalYears(experience: ExperienceEntry[], now: Date): number {
  const nowIdx = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const ranges = experience
    .map((e) => [monthIndex(e.start), e.end ? monthIndex(e.end) : nowIdx] as const)
    .filter(([s, e]) => e >= s)
    .sort((a, b) => a[0] - b[0]);

  let months = 0;
  let curStart = -1;
  let curEnd = -1;
  for (const [s, e] of ranges) {
    if (s > curEnd) {
      if (curEnd >= 0) months += curEnd - curStart;
      curStart = s;
      curEnd = e;
    } else {
      curEnd = Math.max(curEnd, e);
    }
  }
  if (curEnd >= 0) months += curEnd - curStart;
  return Math.round((months / 12) * 10) / 10;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findDomainEvidence(domain: string, input: ScoringInput): string | undefined {
  const re = new RegExp(`\\b${escapeRegExp(domain)}\\b`, "i");
  const passages = [
    input.summary,
    ...input.experience.flatMap((e) => [`${e.title}, ${e.company}`, ...e.bullets]),
  ];
  return passages.find((p) => re.test(p));
}

function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

export function scoreResume(input: ScoringInput, job: Job, now: Date): MatchResult {
  const { must_have, nice_to_have, domains } = job.requirements;
  const evidence: MatchEvidence[] = [];

  const matchedMust: string[] = [];
  const missingMust: string[] = [];
  let mustWeight = 0;
  let mustTotal = 0;
  for (const req of must_have) {
    mustTotal += req.weight;
    const hit = findSkill(req, input.skills);
    if (hit) {
      mustWeight += req.weight;
      matchedMust.push(req.skill);
      evidence.push({ requirement: req.skill, kind: "must", quote: hit.evidence });
    } else {
      missingMust.push(req.skill);
    }
  }

  const matchedNice: string[] = [];
  let niceWeight = 0;
  let niceTotal = 0;
  for (const req of nice_to_have) {
    niceTotal += req.weight;
    const hit = findSkill(req, input.skills);
    if (hit) {
      niceWeight += req.weight;
      matchedNice.push(req.skill);
      evidence.push({ requirement: req.skill, kind: "nice", quote: hit.evidence });
    }
  }

  const matchedDomains: string[] = [];
  for (const domain of domains) {
    const quote = findDomainEvidence(domain, input);
    if (quote) {
      matchedDomains.push(domain);
      evidence.push({ requirement: domain, kind: "domain", quote });
    }
  }

  const years = totalYears(input.experience, now);
  const breakdown = {
    must: mustTotal ? mustWeight / mustTotal : 1,
    experience: job.minYears > 0 ? Math.min(1, years / job.minYears) : 1,
    domain: Math.min(1, matchedDomains.length / 2),
    nice: niceTotal ? niceWeight / niceTotal : 0,
  };

  const score = Math.round(
    breakdown.must * WEIGHTS.must +
      breakdown.experience * WEIGHTS.experience +
      breakdown.domain * WEIGHTS.domain +
      breakdown.nice * WEIGHTS.nice,
  );

  const reasons: MatchReason[] = [];
  const mustCount = must_have.length;
  if (missingMust.length === 0) {
    reasons.push({ kind: "ok", text: `Has all ${mustCount} must-have skills` });
  } else if (breakdown.must >= 0.6) {
    reasons.push({
      kind: "warn",
      text: `Has ${matchedMust.length} of ${mustCount} must-haves; missing ${missingMust.join(", ")}`,
    });
  } else {
    reasons.push({
      kind: "miss",
      text: `Missing ${missingMust.length} of ${mustCount} must-haves: ${missingMust.join(", ")}`,
    });
  }

  const yrs = `${years} yrs experience (${job.minYears}+ required)`;
  if (breakdown.experience >= 1) reasons.push({ kind: "ok", text: yrs });
  else if (breakdown.experience >= 0.6) reasons.push({ kind: "warn", text: yrs });
  else reasons.push({ kind: "miss", text: yrs });

  if (matchedDomains.length >= 2) {
    reasons.push({ kind: "ok", text: `Domain fit: ${matchedDomains.join(", ")}` });
  } else if (matchedDomains.length === 1) {
    reasons.push({ kind: "warn", text: `Some domain fit: ${matchedDomains[0]}` });
  } else {
    reasons.push({ kind: "miss", text: `No ${listJoin(domains)} background found` });
  }

  return {
    score,
    breakdown,
    matchedMust,
    missingMust,
    matchedNice,
    matchedDomains,
    years,
    reasons,
    evidence,
    scoringVersion: SCORING_VERSION,
  };
}

export type ScoreBand = "high" | "mid" | "low";

export function scoreBand(score: number): ScoreBand {
  if (score >= 80) return "high";
  if (score >= 60) return "mid";
  return "low";
}

/** True when a resume skill satisfies any requirement of the job (used to highlight chips). */
export function skillMatchesJob(skillName: string, job: Job): boolean {
  const c = canonicalSkill(skillName);
  return [...job.requirements.must_have, ...job.requirements.nice_to_have].some((r) =>
    requirementTerms(r).has(c),
  );
}

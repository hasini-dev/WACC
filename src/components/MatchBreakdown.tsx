import type { MatchResult } from "@/types/applicant";
import type { Job } from "@/types/job";
import { WEIGHTS } from "@/lib/match-scoring";
import styles from "./MatchBreakdown.module.css";

const ROWS = [
  { key: "must", label: "Must-have", max: WEIGHTS.must, color: "var(--green)" },
  { key: "experience", label: "Experience", max: WEIGHTS.experience, color: "var(--blue)" },
  { key: "domain", label: "Domain", max: WEIGHTS.domain, color: "var(--purple)" },
  { key: "nice", label: "Nice-to-have", max: WEIGHTS.nice, color: "var(--yellow)" },
] as const;

export function MatchBreakdown({ match, job }: { match: MatchResult; job: Job }) {
  const evidenceFor = (req: string) => match.evidence.find((e) => e.requirement === req);
  return (
    <section className={`post ${styles.post}`} aria-labelledby="breakdown-heading">
      <h3 id="breakdown-heading" className={styles.heading}>
        Match breakdown
        <span className={styles.version}>scoring {match.scoringVersion}</span>
      </h3>

      <dl className={styles.bars}>
        {ROWS.map((r) => {
          const pts = Math.round(match.breakdown[r.key] * r.max);
          return (
            <div key={r.key} className={styles.row}>
              <dt>{r.label}</dt>
              <dd>
                <span className={styles.track} aria-hidden="true">
                  <span style={{ width: `${(pts / r.max) * 100}%`, background: r.color }} />
                </span>
                <span className={styles.pts}>
                  {pts}
                  <span className={styles.max}>/{r.max}</span>
                </span>
              </dd>
            </div>
          );
        })}
      </dl>

      <h4 className={styles.sub}>Must-haves</h4>
      <ul className={styles.chips}>
        {job.requirements.must_have.map((req) => {
          const met = match.matchedMust.includes(req.skill);
          return (
            <li key={req.skill} data-met={met || undefined}>
              <span aria-hidden="true">{met ? "✓" : "✕"}</span> {req.skill}
              <span className="sr-only">{met ? " (met)" : " (missing)"}</span>
            </li>
          );
        })}
      </ul>

      <details className={styles.evidence}>
        <summary>Evidence behind this score ({match.evidence.length} quotes)</summary>
        <ul>
          {[...job.requirements.must_have, ...job.requirements.nice_to_have].map((req) => {
            const ev = evidenceFor(req.skill);
            if (!ev) return null;
            return (
              <li key={req.skill}>
                <b>{req.skill}</b>
                <q>{ev.quote}</q>
              </li>
            );
          })}
          {match.matchedDomains.map((d) => (
            <li key={d}>
              <b>Domain: {d}</b>
              <q>{evidenceFor(d)?.quote}</q>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

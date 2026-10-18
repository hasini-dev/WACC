import type { Applicant, Application } from "@/types/applicant";
import type { Job } from "@/types/job";
import type { ApplicationStatus } from "@/types/review";
import { skillMatchesJob } from "@/lib/match-scoring";
import { Avatar } from "./Avatar";
import { MatchBreakdown } from "./MatchBreakdown";
import { MatchRing } from "./MatchRing";
import styles from "./ResumeDetail.module.css";

function fmtMonth(yyyyMm: string | null): string {
  if (!yyyyMm) return "Present";
  const [y, m] = yyyyMm.split("-");
  return new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  to_review: "In deck",
  shortlist: "Shortlisted",
  pass: "Passed",
};

interface Props {
  application: Application;
  applicant: Applicant;
  job: Job;
  status: ApplicationStatus;
  titleId?: string;
  onDecide?: (decision: "shortlist" | "pass") => void;
  onMoveBack?: () => void;
}

export function ResumeDetail({ application, applicant, job, status, titleId = "detail-name", onDecide, onMoveBack }: Props) {
  const { resume, file } = applicant;
  const { match } = application;

  return (
    <div className={styles.detail}>
      <header className={`post ${styles.header}`}>
        <Avatar name={applicant.fullName} seed={applicant.id} size={64} />
        <div className={styles.who}>
          <h2 id={titleId} className={styles.name}>
            {applicant.fullName}
          </h2>
          <p className={styles.title}>{applicant.currentTitle}</p>
          <p className={styles.meta}>
            <span>{applicant.location}</span>
            <span>{resume.contact.email}</span>
            <span>{resume.contact.phone}</span>
          </p>
          <p className={styles.status} data-status={status}>
            {STATUS_LABEL[status]} · applied for {job.title}
          </p>
        </div>
        <MatchRing score={match.score} size={84} label={`${match.score}% match for ${job.title}`} />
      </header>

      {(onDecide || onMoveBack) && (
        <div className={styles.actions}>
          {status === "to_review" && onDecide ? (
            <>
              <button type="button" className={styles.pass} onClick={() => onDecide("pass")}>
                <span aria-hidden="true">✕</span> Pass
              </button>
              <button type="button" className={styles.shortlist} onClick={() => onDecide("shortlist")}>
                <span aria-hidden="true">♥</span> Shortlist
              </button>
            </>
          ) : (
            onMoveBack && (
              <button type="button" className={styles.moveBack} onClick={onMoveBack}>
                Move back to deck
              </button>
            )
          )}
        </div>
      )}

      <MatchBreakdown match={match} job={job} />

      <section className={`post ${styles.section}`} aria-labelledby={`${titleId}-summary`}>
        <h3 id={`${titleId}-summary`} className={styles.chip} data-color="purple">
          Summary
        </h3>
        <p className={styles.body}>{resume.summary}</p>
      </section>

      <section className={`post ${styles.section}`} aria-labelledby={`${titleId}-experience`}>
        <h3 id={`${titleId}-experience`} className={styles.chip} data-color="blue">
          Experience
        </h3>
        <ol className={styles.jobs}>
          {resume.experience.map((e) => (
            <li key={`${e.company}-${e.start}`}>
              <p className={styles.role}>
                {e.title} <span className={styles.company}>· {e.company}</span>
              </p>
              <p className={styles.dates}>
                {fmtMonth(e.start)} – {fmtMonth(e.end)}
              </p>
              <ul className={styles.bullets}>
                {e.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <section className={`post ${styles.section}`} aria-labelledby={`${titleId}-skills`}>
        <h3 id={`${titleId}-skills`} className={styles.chip} data-color="green">
          Skills
        </h3>
        <ul className={styles.skills}>
          {resume.skills.map((s) => {
            const hit = skillMatchesJob(s.name, job);
            return (
              <li key={s.name} data-match={hit || undefined}>
                {s.name}
                {hit && <span className="sr-only"> (matches job)</span>}
              </li>
            );
          })}
        </ul>
      </section>

      <section className={`post ${styles.section}`} aria-labelledby={`${titleId}-education`}>
        <h3 id={`${titleId}-education`} className={styles.chip} data-color="yellow">
          Education
        </h3>
        <ul className={styles.edu}>
          {resume.education.map((e) => (
            <li key={e.degree + e.school}>
              <strong>{e.degree}</strong> · {e.school}
              {e.year && <span className={styles.dates}> · {e.year}</span>}
            </li>
          ))}
        </ul>
      </section>

      <details className={`post ${styles.raw}`}>
        <summary>
          Show extracted text{" "}
          <span className={styles.rawMeta}>
            ({file.fileName} · {file.extractionMethod === "ocr" ? "OCR" : "text layer"} · {file.rawText.length} chars)
          </span>
        </summary>
        <pre tabIndex={0} aria-label="Extracted resume text">
          {file.rawText}
        </pre>
      </details>
    </div>
  );
}

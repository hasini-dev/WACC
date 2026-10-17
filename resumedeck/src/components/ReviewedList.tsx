import type { Application } from "@/types/applicant";
import { APPLICANTS_BY_ID } from "@/lib/mock-data";
import { scoreBand } from "@/lib/match-scoring";
import { Avatar } from "./Avatar";
import styles from "./ReviewedList.module.css";

interface Props {
  applications: Application[];
  emptyText: string;
  onOpen: (applicationId: string) => void;
  onMoveBack: (applicationId: string) => void;
}

export function ReviewedList({ applications, emptyText, onOpen, onMoveBack }: Props) {
  if (applications.length === 0) {
    return <p className={`post ${styles.empty}`}>{emptyText}</p>;
  }
  return (
    <ul className={styles.list}>
      {applications.map((app) => {
        const ap = APPLICANTS_BY_ID.get(app.applicantId);
        if (!ap) return null;
        return (
          <li key={app.id} className={`post ${styles.row}`}>
            <Avatar name={ap.fullName} seed={ap.id} size={40} />
            <div className={styles.who}>
              <button type="button" className={styles.name} onClick={() => onOpen(app.id)}>
                {ap.fullName}
              </button>
              <span className={styles.title}>{ap.currentTitle}</span>
            </div>
            <span className={styles.score} data-band={scoreBand(app.match.score)}>
              {app.match.score}%
            </span>
            <button type="button" className={styles.back} onClick={() => onMoveBack(app.id)}>
              Move back to deck
            </button>
          </li>
        );
      })}
    </ul>
  );
}

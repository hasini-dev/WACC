import { scoreBand } from "@/lib/match-scoring";
import styles from "./MatchRing.module.css";

export function MatchRing({ score, size = 76, label }: { score: number; size?: number; label?: string }) {
  const band = scoreBand(score);
  return (
    <div
      className={styles.ring}
      data-band={band}
      style={{ width: size, height: size, ["--pct" as string]: `${score}%` }}
      role="img"
      aria-label={label ?? `${score}% match`}
    >
      <span className={styles.inner}>
        <span className={styles.num} style={{ fontSize: Math.round(size * 0.29) }}>
          {score}
        </span>
        <span className={styles.unit}>%</span>
      </span>
    </div>
  );
}

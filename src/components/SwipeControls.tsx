import { UndoButton } from "./UndoButton";
import styles from "./SwipeControls.module.css";

interface Props {
  name?: string;
  disabled: boolean;
  canUndo: boolean;
  onPass: () => void;
  onShortlist: () => void;
  onUndo: () => void;
}

export function SwipeControls({ name, disabled, canUndo, onPass, onShortlist, onUndo }: Props) {
  return (
    <div className={styles.controls} role="group" aria-label="Decision">
      <button
        type="button"
        className={`${styles.round} ${styles.pass}`}
        onClick={onPass}
        disabled={disabled}
        aria-label={name ? `Pass on ${name}` : "Pass"}
        aria-keyshortcuts="ArrowLeft"
        title="Pass (←)"
      >
        <span aria-hidden="true">✕</span>
      </button>
      <UndoButton onUndo={onUndo} disabled={!canUndo} />
      <button
        type="button"
        className={`${styles.round} ${styles.shortlist}`}
        onClick={onShortlist}
        disabled={disabled}
        aria-label={name ? `Shortlist ${name}` : "Shortlist"}
        aria-keyshortcuts="ArrowRight"
        title="Shortlist (→)"
      >
        <span aria-hidden="true">♥</span>
      </button>
    </div>
  );
}

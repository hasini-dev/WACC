import styles from "./SwipeControls.module.css";

export function UndoButton({ onUndo, disabled }: { onUndo: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      className={`${styles.round} ${styles.undo}`}
      onClick={onUndo}
      disabled={disabled}
      aria-label="Undo last decision"
      aria-keyshortcuts="Z Backspace"
      title="Undo (Z)"
    >
      <span aria-hidden="true">↶</span>
    </button>
  );
}

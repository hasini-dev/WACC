"use client";

import { useEffect } from "react";
import type { Toast as ToastData } from "@/lib/deck-store";
import styles from "./Toast.module.css";

const TOAST_MS = 5_000;

export function Toast({ toast, onUndo, onDismiss }: { toast: ToastData | null; onUndo: (reviewId: string) => void; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, TOAST_MS);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;
  return (
    // Not a live region: DeckProvider's announcer already reads decisions aloud.
    <div className={styles.toast} key={toast.id} data-testid="toast" data-tone={toast.tone}>
      <span>{toast.text}</span>
      {toast.reviewId && (
        <button type="button" onClick={() => onUndo(toast.reviewId!)}>
          Undo
        </button>
      )}
    </div>
  );
}

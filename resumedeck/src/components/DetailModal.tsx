"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import styles from "./DetailModal.module.css";

interface Props {
  open: boolean;
  labelledBy: string;
  fullPageHref: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Native <dialog> opened with showModal(): the rest of the page becomes inert
 * (focus is trapped), Esc closes it, and focus returns to the opener.
 */
export function DetailModal({ open, labelledBy, fullPageHref, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      dialog.scrollTop = 0;
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => {
      onClose();
      const target = opener.current;
      opener.current = null;
      // The opener may have unmounted (e.g. the card was decided); fall back to main.
      if (target && target.isConnected) target.focus();
      else document.getElementById("main")?.focus();
    };
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={labelledBy}
      onClick={(e) => {
        // Click on the backdrop (the dialog element itself) closes it.
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      <div className={styles.bar}>
        <Link href={fullPageHref} className={styles.full}>
          Open full page
        </Link>
        <button type="button" className={styles.close} onClick={() => ref.current?.close()} aria-label="Close resume">
          ✕ <span>Esc</span>
        </button>
      </div>
      {open && children}
    </dialog>
  );
}

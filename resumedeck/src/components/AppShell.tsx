import Link from "next/link";
import type { ReactNode } from "react";
import { BRAND } from "@/lib/brand";
import { COMPANY_NAME } from "@/lib/mock-data";
import { JobDeckList } from "./JobDeckList";
import { ResumeDbPanel } from "./ResumeDbPanel";
import styles from "./AppShell.module.css";

export function AppShell({ selectedJobId, children }: { selectedJobId?: string; children: ReactNode }) {
  return (
    <>
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <Link href="/dashboard" className={styles.brand} aria-label={`${BRAND} dashboard`}>
            <span className={styles.mark} aria-hidden="true">
              {BRAND[0]}
            </span>
            <span className={styles.wordmark}>{BRAND}</span>
          </Link>
          <span className={styles.hiring}>
            Hiring for <strong>{COMPANY_NAME}</strong>
          </span>
          <ul className={styles.keys} aria-label="Keyboard shortcuts">
            <li><kbd>←</kbd> pass</li>
            <li><kbd>→</kbd> shortlist</li>
            <li><kbd>Z</kbd> undo</li>
            <li><kbd>Enter</kbd> open</li>
          </ul>
        </div>
      </header>
      <div className={styles.shell}>
        <nav className={styles.rail} aria-label="Job decks">
          <JobDeckList selectedJobId={selectedJobId} />
        </nav>
        <main id="main" className={styles.center} tabIndex={-1}>
          {children}
        </main>
        <aside className={styles.side} aria-label="Resume database">
          <ResumeDbPanel />
        </aside>
      </div>
    </>
  );
}

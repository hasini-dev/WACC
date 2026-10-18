import Link from "next/link";
import type { ReactNode } from "react";
import { BRAND } from "@/lib/brand";
import type { Me } from "@/types/api";
import { JobDeckList } from "./JobDeckList";
import { ResumeDbPanel } from "./ResumeDbPanel";
import styles from "./AppShell.module.css";

export function AppShell({ me, selectedJobId, children }: { me: Me; selectedJobId?: string; children: ReactNode }) {
  return (
    <>
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
        <Link href="/dashboard" className={styles.brand} aria-label={`${BRAND} dashboard`}>
          <img className={styles.mark} src="/assets/Logo.png" alt="" />
          <span className={styles.wordmark}>{BRAND}</span>
        </Link>
          <span className={styles.hiring}>
            Hiring for <strong>{me.orgName}</strong>
          </span>
          <ul className={styles.keys} aria-label="Keyboard shortcuts">
            <li><kbd>←</kbd> pass</li>
            <li><kbd>→</kbd> shortlist</li>
            <li><kbd>Z</kbd> undo</li>
            <li><kbd>Enter</kbd> open</li>
          </ul>
          <form action="/api/auth/signout" method="post" className={styles.account}>
            <span className={styles.email}>{me.email}</span>
            <button type="submit">Sign out</button>
          </form>
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

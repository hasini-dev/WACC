import Link from "next/link";
import { AppShell } from "@/components/AppShell";

export default function NotFound() {
  return (
    <AppShell>
      <section className="post" style={{ padding: "28px 22px", textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22 }}>Nothing here</h1>
        <p>That job or applicant doesn&apos;t exist.</p>
        <Link href="/dashboard">Back to your decks</Link>
      </section>
    </AppShell>
  );
}

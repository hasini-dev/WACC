import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ maxWidth: 560, margin: "80px auto", padding: "0 16px" }}>
      <section className="post" style={{ padding: "28px 22px", textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22 }}>Nothing here</h1>
        <p>That job or applicant doesn&apos;t exist, or isn&apos;t in your organization.</p>
        <Link href="/dashboard">Back to your decks</Link>
      </section>
    </main>
  );
}

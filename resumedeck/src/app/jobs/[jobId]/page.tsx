import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DeckView } from "@/components/DeckView";
import { JOBS, JOBS_BY_ID } from "@/lib/mock-data";

export function generateStaticParams() {
  return JOBS.map((j) => ({ jobId: j.id }));
}

export async function generateMetadata({ params }: PageProps<"/jobs/[jobId]">): Promise<Metadata> {
  const { jobId } = await params;
  const job = JOBS_BY_ID.get(jobId);
  return { title: job ? `${job.title} · clicked` : "Job not found · clicked" };
}

export default async function JobDeckPage({ params }: PageProps<"/jobs/[jobId]">) {
  const { jobId } = await params;
  const job = JOBS_BY_ID.get(jobId);
  if (!job) notFound();
  return (
    <AppShell selectedJobId={job.id}>
      <DeckView job={job} />
    </AppShell>
  );
}

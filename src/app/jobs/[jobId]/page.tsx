import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DeckView } from "@/components/DeckView";
import { requirePageMe } from "@/lib/page-auth";
import { getJob } from "@/lib/repo";

export async function generateMetadata({ params }: PageProps<"/jobs/[jobId]">): Promise<Metadata> {
  const { jobId } = await params;
  const me = await requirePageMe();
  const job = getJob(me.orgId, jobId);
  return { title: job ? `${job.title} · clicked` : "Job not found · clicked" };
}

export default async function JobDeckPage({ params }: PageProps<"/jobs/[jobId]">) {
  const { jobId } = await params;
  const me = await requirePageMe();
  const job = getJob(me.orgId, jobId);
  if (!job) notFound();
  return (
    <AppShell me={me} selectedJobId={job.id}>
      <DeckView job={job} />
    </AppShell>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ApplicantPageView } from "@/components/ApplicantPageView";
import { requirePageMe } from "@/lib/page-auth";
import { applicantDetail, getJob } from "@/lib/repo";

export const metadata: Metadata = { title: "Resume · clicked" };

export default async function ApplicantPage({ params }: PageProps<"/applicants/[applicantId]">) {
  const { applicantId } = await params;
  const me = await requirePageMe();
  const card = applicantDetail(me.orgId, applicantId);
  const job = card ? getJob(me.orgId, card.application.jobId) : null;
  if (!card || !job) notFound();
  return (
    <AppShell me={me} selectedJobId={job.id}>
      <h1 className="sr-only">Resume: {card.applicant.fullName}</h1>
      <ApplicantPageView card={card} job={job} />
    </AppShell>
  );
}

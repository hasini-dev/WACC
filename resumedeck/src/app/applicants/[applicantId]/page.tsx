import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ApplicantPageView } from "@/components/ApplicantPageView";
import { APPLICANTS, APPLICANTS_BY_ID, APPLICATIONS_BY_ID } from "@/lib/mock-data";

export function generateStaticParams() {
  return APPLICANTS.map((a) => ({ applicantId: a.id }));
}

function findApplication(applicantId: string) {
  return [...APPLICATIONS_BY_ID.values()].find((a) => a.applicantId === applicantId);
}

export async function generateMetadata({ params }: PageProps<"/applicants/[applicantId]">): Promise<Metadata> {
  const { applicantId } = await params;
  const applicant = APPLICANTS_BY_ID.get(applicantId);
  return { title: applicant ? `${applicant.fullName} · clicked` : "Applicant not found · clicked" };
}

export default async function ApplicantPage({ params }: PageProps<"/applicants/[applicantId]">) {
  const { applicantId } = await params;
  const applicant = APPLICANTS_BY_ID.get(applicantId);
  const application = findApplication(applicantId);
  if (!applicant || !application) notFound();
  return (
    <AppShell selectedJobId={application.jobId}>
      <h1 className="sr-only">Resume: {applicant.fullName}</h1>
      <ApplicantPageView applicationId={application.id} />
    </AppShell>
  );
}

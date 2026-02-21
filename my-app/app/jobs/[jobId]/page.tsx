import JobClient from "@/app/jobs/[jobId]/JobClient";

export default async function JobPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  return <JobClient jobId={jobId} />;
}

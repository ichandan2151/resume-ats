import SearchCandidateClient from "@/app/search-candidate/[id]/SearchCandidateClient";

export default async function SearchCandidatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SearchCandidateClient id={id} />;
}

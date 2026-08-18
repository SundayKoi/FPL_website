import { TeamPageContent } from "@/app/teams/[slug]/page";

export default async function AcademyTeamPage({ params }: { params: Promise<{ slug: string }> }) {
  return <TeamPageContent params={params} league="academy" />;
}

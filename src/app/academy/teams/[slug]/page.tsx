import { TeamPageContent } from "@/app/teams/[slug]/page";

export default async function AcademyTeamPage({ params }: { params: Promise<{ slug: string }> }) {
  // The shared content receives the Academy league key, so roster claims use
  // Academy's active draft, canonical pool, league-team ID, and season.
  return <TeamPageContent params={params} league="academy" />;
}

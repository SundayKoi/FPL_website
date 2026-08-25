import { MyTeamScoutingPageView } from "@/app/my-team/scouting/view";

export default function AcademyMyTeamScoutingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return <MyTeamScoutingPageView league="academy" searchParams={searchParams} />;
}

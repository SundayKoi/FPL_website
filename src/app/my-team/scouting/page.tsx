import { MyTeamScoutingPageView } from "./view";

export default function MyTeamScoutingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return <MyTeamScoutingPageView league="premier" searchParams={searchParams} />;
}

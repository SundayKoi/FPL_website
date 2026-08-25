import { MyTeamPageView } from "./view";

export default function MyTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return <MyTeamPageView league="premier" searchParams={searchParams} />;
}

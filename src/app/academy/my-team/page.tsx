import { MyTeamPageView } from "@/app/my-team/page";

export default function AcademyMyTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return <MyTeamPageView league="academy" searchParams={searchParams} />;
}

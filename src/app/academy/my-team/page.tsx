import type { Metadata } from "next";
import { MyTeamPageView } from "@/app/my-team/view";

export const metadata: Metadata = {
  title: "My Team — FPL Academy",
};

export default function AcademyMyTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return <MyTeamPageView league="academy" searchParams={searchParams} />;
}

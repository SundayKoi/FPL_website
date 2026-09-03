import type { Metadata } from "next";
import { MyTeamPageView } from "./view";

export const metadata: Metadata = {
  title: "My Team — FPL",
};

export default function MyTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return <MyTeamPageView league="premier" searchParams={searchParams} />;
}

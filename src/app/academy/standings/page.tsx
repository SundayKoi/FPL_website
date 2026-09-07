import type { Metadata } from "next";
import StandingsPageView from "@/components/standings/StandingsPageView";

export const metadata: Metadata = {
  title: "Standings — FPL Academy",
  description: "Every Academy team's record this season, their form, and the race week by week.",
};

export default function AcademyStandingsPage() {
  return <StandingsPageView league="academy" />;
}

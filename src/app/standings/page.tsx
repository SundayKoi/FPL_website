import type { Metadata } from "next";
import StandingsPageView from "@/components/standings/StandingsPageView";

export const metadata: Metadata = {
  title: "Standings — FPL",
  description: "Every team's record this season, their form, and the race week by week.",
};

export default function StandingsPage() {
  return <StandingsPageView league="premier" />;
}

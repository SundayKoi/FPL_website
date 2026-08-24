import type { Metadata } from "next";
import { MomentsPageView } from "@/app/cards/moments/page";

export const metadata: Metadata = {
  title: "Academy Moments — FPL",
  description: "The rarest single-game performances of the Academy season, minted as cards.",
};

export default async function AcademyMomentsPage() {
  return MomentsPageView({ league: "academy" });
}

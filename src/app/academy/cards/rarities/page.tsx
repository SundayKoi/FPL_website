import type { Metadata } from "next";
import { RaritiesPageView } from "@/app/cards/rarities/page";

export const metadata: Metadata = {
  title: "Academy Rarities — FPL",
  description: "Every rarity an Academy card can pull — tiers, parallels, the finishes, inserts and stamps — with the real odds.",
};

export default async function AcademyRaritiesPage() {
  return RaritiesPageView({ league: "academy" });
}

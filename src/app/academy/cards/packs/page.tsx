import type { Metadata } from "next";
import { PacksPageView } from "@/app/cards/packs/page";

export const metadata: Metadata = {
  title: "Academy Packs — FPL",
  description: "Spend betting dollars on packs of Academy player cards and build a collection.",
};

export default async function AcademyPacksPage() {
  return PacksPageView({ league: "academy" });
}

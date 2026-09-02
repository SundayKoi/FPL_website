import type { Metadata } from "next";
import { BrowsePageView } from "@/app/cards/browse/page";

export const metadata: Metadata = {
  title: "Academy Players — FPL",
  description: "Every Academy player as a living trading card, rated from this season's stats.",
};

export default async function AcademyBrowsePage() {
  return BrowsePageView({ league: "academy" });
}

import type { Metadata } from "next";
import { FantasyPageView } from "@/app/cards/fantasy/page";

export const metadata: Metadata = {
  title: "Academy Fantasy — FPL",
  description: "Field a weekly Academy lineup from the cards you own and play for betting dollars.",
};

export default async function AcademyFantasyPage() {
  return FantasyPageView({ league: "academy" });
}

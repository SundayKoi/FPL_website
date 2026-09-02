import type { Metadata } from "next";
import { CardsPageView } from "@/app/cards/page";

export const metadata: Metadata = {
  title: "Academy Cards — FPL",
  description: "The Academy league's living trading cards — a premium member perk.",
};

export default async function AcademyCardsPage() {
  return CardsPageView({ league: "academy" });
}

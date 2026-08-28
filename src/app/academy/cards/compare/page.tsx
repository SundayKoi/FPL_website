import type { Metadata } from "next";
import { CompareCardsPageView } from "@/components/cards/CompareCardsPageView";

export const metadata: Metadata = {
  title: "Compare Academy Cards — FPL",
  description: "Two Academy player cards head to head.",
};

export default async function AcademyCompareCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return CompareCardsPageView({ searchParams, league: "academy" });
}

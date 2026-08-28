import type { Metadata } from "next";
import { CompareCardsPageView } from "@/components/cards/CompareCardsPageView";

export const metadata: Metadata = {
  title: "Compare Cards — FPL",
  description: "Two player cards head to head.",
};

export default async function CompareCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return CompareCardsPageView({ searchParams, league: "premier" });
}

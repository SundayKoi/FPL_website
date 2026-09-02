import type { Metadata } from "next";
import { CollectionPageView } from "@/app/cards/collection/page";

export const metadata: Metadata = {
  title: "Academy Collection — FPL",
  description: "Every Academy card you own, your binder, and your team sets.",
};

export default async function AcademyCollectionPage({
  searchParams,
}: {
  searchParams: Promise<{ setWeek?: string }>;
}) {
  const { setWeek } = await searchParams;
  return CollectionPageView({ league: "academy", setWeek });
}

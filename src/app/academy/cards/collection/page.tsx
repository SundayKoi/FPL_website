import type { Metadata } from "next";
import { CollectionPageView } from "@/app/cards/collection/page";

export const metadata: Metadata = {
  title: "Academy Collection — FPL",
  description: "Every Academy card you own, your binder, and your team sets.",
};

export default async function AcademyCollectionPage({
  searchParams,
}: {
  searchParams: Promise<{ setWeek?: string; view?: string }>;
}) {
  const { setWeek, view } = await searchParams;
  return CollectionPageView({ league: "academy", setWeek, view: view === "season-end" ? "season-end" : "weekly" });
}

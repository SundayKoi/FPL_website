import type { Metadata } from "next";
import { CollectionPageView } from "@/app/cards/collection/page";

export const metadata: Metadata = {
  title: "Academy Collection — FPL",
  description: "Every Academy card you own, your binder, and your team sets.",
};

export default async function AcademyCollectionPage({
  searchParams,
}: {
  searchParams: Promise<{ setWeek?: string; view?: string; kind?: string | string[]; sort?: string | string[] }>;
}) {
  const { setWeek, view, kind, sort } = await searchParams;
  return CollectionPageView({ league: "academy", setWeek, kind: typeof kind === "string" ? kind : undefined, sort: typeof sort === "string" ? sort : undefined, view: view === "season-end" ? "season-end" : "weekly" });
}

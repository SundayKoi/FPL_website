import type { Metadata } from "next";
import { ExpeditionsPageView } from "@/app/cards/expeditions/page";

export const metadata: Metadata = {
  title: "Academy Expeditions — FPL",
  description: "Send three Academy cards out for a few hours and collect what they bring back.",
};

export default async function AcademyExpeditionsPage({ searchParams }: { searchParams: Promise<{ send?: string }> }) {
  const { send } = await searchParams;
  return ExpeditionsPageView({ league: "academy", send });
}

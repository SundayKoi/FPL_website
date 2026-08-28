import type { Metadata } from "next";
import { ExpeditionsPageView } from "@/app/cards/expeditions/page";

export const metadata: Metadata = {
  title: "Academy Card Expeditions — FPL",
  description: "Send three Academy cards out for a few hours and collect what they bring back.",
};

export default async function AcademyExpeditionsPage() {
  return ExpeditionsPageView({ league: "academy" });
}

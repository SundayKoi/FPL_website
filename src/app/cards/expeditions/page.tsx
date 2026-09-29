import type { Metadata } from "next";
import { ExpeditionsPageView } from "./ExpeditionsPageView";

export const metadata: Metadata = {
  title: "Expeditions — FPL",
  description: "Send three cards out on a route with forks. Answer the forks, and find out who comes home — and what they come home as.",
};

export default async function ExpeditionsPage({ searchParams }: { searchParams: Promise<{ send?: string }> }) {
  const { send } = await searchParams;
  return ExpeditionsPageView({ league: "premier", send });
}

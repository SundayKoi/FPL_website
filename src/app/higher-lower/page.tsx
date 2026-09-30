import type { Metadata } from "next";
import { HigherLowerPageView } from "@/components/higher-lower/HigherLowerPageView";

export const metadata: Metadata = {
  title: "Higher or Lower — FPL",
  description: "Judge whether today's Premier player-card challengers have a higher or lower OVR.",
};

export default async function HigherLowerPage() {
  return HigherLowerPageView({ league: "premier" });
}

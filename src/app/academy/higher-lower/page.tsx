import type { Metadata } from "next";
import { HigherLowerPageView } from "@/components/higher-lower/HigherLowerPageView";

export const metadata: Metadata = {
  title: "Academy Higher or Lower — FPL",
  description: "Judge whether today's Academy player-card challengers have a higher or lower OVR.",
};

export default async function AcademyHigherLowerPage() {
  return HigherLowerPageView({ league: "academy" });
}

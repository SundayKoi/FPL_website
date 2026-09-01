import type { Metadata } from "next";
import { PlayPageView } from "@/app/cards/play/page";

export const metadata: Metadata = {
  title: "Academy Play — FPL",
  description: "Fantasy, expeditions, and the weekly draw for the Academy collection.",
};

export default function AcademyPlayPage() {
  return PlayPageView({ league: "academy" });
}

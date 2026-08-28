import type { Metadata } from "next";
import { DrawPageView } from "@/components/cards/DrawPageView";

export const metadata: Metadata = {
  title: "The Academy Weekly Draw — FPL",
  description: "Every Academy card copy is a raffle ticket. One card wins every week — here is every winner.",
};

export default async function AcademyDrawPage() {
  return DrawPageView({ league: "academy" });
}

import type { Metadata } from "next";
import { DrawPageView } from "@/components/cards/DrawPageView";

export const metadata: Metadata = {
  title: "The Weekly Draw — FPL",
  description: "Every card copy is a raffle ticket. One card wins every week — here is every winner.",
};

export default async function DrawPage() {
  return DrawPageView({ league: "premier" });
}

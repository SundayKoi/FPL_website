import type { Metadata } from "next";
import { BountiesPageView } from "./view";

export const metadata: Metadata = {
  title: "Bounties — FPL",
  description: "Post a bounty on a card you need, or fill one from your shelf.",
};

export default async function BountiesPage() {
  return BountiesPageView({ league: "premier" });
}

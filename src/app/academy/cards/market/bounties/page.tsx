import type { Metadata } from "next";
import { BountiesPageView } from "@/app/cards/market/bounties/page";

export const metadata: Metadata = {
  title: "Academy Bounties — FPL",
  description: "Post a bounty on an Academy card you need, or fill one from your shelf.",
};

export default async function AcademyBountiesPage() {
  return BountiesPageView({ league: "academy" });
}

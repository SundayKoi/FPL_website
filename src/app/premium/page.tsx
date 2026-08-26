import type { Metadata } from "next";
import { PremiumPageView } from "./view";

export const metadata: Metadata = {
  title: "Premium HQ — FPL",
  description: "The live hub for FPL Premium cards, markets, match tools, and the card economy.",
};

export default async function PremiumPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return PremiumPageView({ searchParams });
}

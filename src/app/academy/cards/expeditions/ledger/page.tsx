import type { Metadata } from "next";
import { LedgerPageView } from "@/app/cards/expeditions/ledger/page";

export const metadata: Metadata = {
  title: "Academy ledger of the fallen and the found — FPL",
  description: "Every Academy card lost on an expedition, and every one that came back.",
};

export default async function AcademyLedgerPage() {
  return LedgerPageView({ league: "academy" });
}

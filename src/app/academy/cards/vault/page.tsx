import type { Metadata } from "next";
import { VaultPageView } from "@/app/cards/vault/page";

export const metadata: Metadata = {
  title: "The Academy Vault — FPL",
  description: "Every Academy one-of-one: who found it, who holds it now, and what is still out there.",
};

export default async function AcademyVaultPage() {
  return VaultPageView({ league: "academy" });
}

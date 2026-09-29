import type { Metadata } from "next";
import LegacyGlossaryRedirect from "@/components/info/LegacyGlossaryRedirect";

export const metadata: Metadata = {
  title: "Glossary moved — FPL",
  robots: { index: false, follow: true },
};

export default function GlossaryRedirect() {
  return <LegacyGlossaryRedirect />;
}

"use client";

import { useEffect } from "react";
import Link from "next/link";
import AboutPageShell from "@/components/info/AboutPageShell";

export function legacyGlossaryDestination(sourceHash: string): string {
  const destinationHash = sourceHash === "dust" ? "term-dust" : sourceHash;
  return `/economy${destinationHash ? `#${encodeURIComponent(destinationHash)}` : ""}`;
}

export default function LegacyGlossaryRedirect() {
  useEffect(() => {
    const sourceHash = window.location.hash.slice(1);
    window.location.replace(legacyGlossaryDestination(sourceHash));
  }, []);

  return (
    <AboutPageShell activeHref="/economy">
      <div className="max-w-2xl py-8">
        <h1 className="font-display text-3xl font-semibold text-white">The glossary has moved</h1>
        <p className="mt-3 text-sm leading-6 text-muted">Opening the combined cards and currency guide…</p>
        <Link href="/economy#glossary" className="mt-4 inline-block text-sm text-action-text underline underline-offset-4">
          Open card terms
        </Link>
      </div>
    </AboutPageShell>
  );
}

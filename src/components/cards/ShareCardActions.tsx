"use client";

// Share row under a card's public page: copy the page link (Discord
// unfurls it into the card via the card.png OG image) or grab the PNG.

import { useState } from "react";
import { cardImageUrl } from "@/lib/cards/shareImage";

export default function ShareCardActions({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(`${window.location.origin}/card/${slug}`).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="btn-coral px-4 py-2 text-xs"
      >
        {copied ? "Copied ✓" : "Copy card link"}
      </button>
      <a
        // Keyed for the same reason the unfurl is: a browser that cached
        // this file keeps handing back a card from several restats ago.
        href={cardImageUrl("", slug, null)}
        download={`${slug}-card.png`}
        className="rounded-full border border-line bg-panel px-4 py-2 text-xs font-semibold uppercase tracking-wide text-steel transition hover:border-coral hover:text-coral"
      >
        Download PNG
      </a>
    </div>
  );
}

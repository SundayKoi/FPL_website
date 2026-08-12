"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ClaimState =
  | { kind: "idle" }
  | { kind: "claiming" }
  | { kind: "claimed"; rank: number }
  | { kind: "signin" }
  | { kind: "error" };

/**
 * The hidden-coin contest coin (see 20260812000004_coin_hunt.sql). A tiny
 * inline SVG recolored to the site's hairline blue so it blends into the
 * rulebook as a stray glyph — deliberately: no pointer cursor, no hover
 * style, not text-searchable. Clicking while signed in claims a find via
 * the claim_coin() RPC, which returns the finder's placement.
 */
export default function HiddenCoin() {
  const [state, setState] = useState<ClaimState>({ kind: "idle" });

  const handleClick = async () => {
    if (state.kind === "claiming" || state.kind === "claimed") return;
    setState({ kind: "claiming" });
    // Created lazily so merely rendering the rulebook never touches
    // Supabase — only an actual click does.
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setState({ kind: "signin" });
      return;
    }
    const { data, error } = await supabase.rpc("claim_coin");
    if (error || typeof data !== "number") {
      setState({ kind: "error" });
      return;
    }
    setState({ kind: "claimed", rank: data });
  };

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => void handleClick()}
        aria-label="?"
        className="cursor-default align-baseline focus:outline-none"
      >
        {/* Bitcoin roundel, recolored to the panel hairline so it hides in
            plain sight at text size. */}
        <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true" className="inline-block">
          <circle cx="12" cy="12" r="12" fill="#1b4263" />
          <path
            d="M15.6 10.6c.2-1.4-.9-2.2-2.4-2.7l.5-1.9-1.2-.3-.5 1.9c-.3-.1-.6-.2-.9-.2l.5-1.9-1.2-.3-.5 1.9-.7-.2-1.6-.4-.3 1.2s.9.2.8.2c.5.1.6.4.6.7l-.6 2.2v.1l-.8 3c-.1.2-.2.4-.6.3 0 0-.8-.2-.8-.2l-.6 1.3 1.5.4.8.2-.5 2 1.2.3.5-1.9c.3.1.6.2.9.2l-.5 1.9 1.2.3.5-2c2 .4 3.5.2 4.2-1.6.5-1.4 0-2.3-1.1-2.8.8-.2 1.3-.7 1.5-1.7zm-2.7 3.7c-.4 1.4-2.8.7-3.6.5l.7-2.6c.8.2 3.3.6 2.9 2.1zm.4-3.7c-.3 1.3-2.3.6-3 .5l.6-2.4c.7.2 2.8.5 2.4 1.9z"
            fill="#0a2a47"
          />
        </svg>
      </button>

      {state.kind !== "idle" && state.kind !== "claiming" && (
        <span
          role="status"
          className="card-brand absolute bottom-full left-1/2 z-20 mb-2 w-56 -translate-x-1/2 px-3 py-2 text-center text-xs font-semibold normal-case tracking-normal"
        >
          {state.kind === "claimed" ? (
            <span className="text-gold">
              🎉 You found the hidden coin — you&apos;re finder #{state.rank}!
            </span>
          ) : state.kind === "signin" ? (
            <span className="text-steel">
              You found something… <a href="/login" className="text-gold underline">sign in</a> to
              claim it.
            </span>
          ) : (
            <span className="text-steel">Something glinted, but the claim failed — try again.</span>
          )}
        </span>
      )}
    </span>
  );
}

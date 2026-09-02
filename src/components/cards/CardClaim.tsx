"use client";

// "This is me" — the one line under a card that links a Discord login to a
// Riot identity. Nothing in the data connects the two (see the header of
// 20260826000017), so a player asks and an admin or their captain confirms.
//
// Deliberately a single quiet row of chips rather than a panel: on the vast
// majority of visits this card belongs to someone else and the claim state is
// trivia. Creation and approval cross the cookie-bound server boundary so an
// exact canonical mapping can be stored and approved atomically; RLS/the RPC
// remain authoritative. Once approved, can_edit_card_art starts returning true
// and the customizer appears on the next refresh with no extra wiring.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { approveCardClaim, requestCardClaim } from "@/lib/cards/claimActions";
import { createClient } from "@/lib/supabase/client";

export type CardClaimState = {
  profileId: string;
  status: "pending" | "approved";
  displayName: string | null;
};

const CHIP = "rounded-full border border-border-subtle bg-surface px-3 py-1 text-xs";
const ACTION =
  "rounded-full border border-border-strong bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted transition hover:border-action-text hover:text-action-text disabled:opacity-40";

export default function CardClaim({
  season,
  summonerName,
  tag,
  viewerProfileId,
  canModerate,
  claim,
  highlight = false,
}: {
  season: string;
  summonerName: string;
  tag: string;
  viewerProfileId: string | null;
  canModerate: boolean;
  claim: CardClaimState | null;
  /** Arrived here from a "claim your card" link (?claim=1) — ring the row so
   *  the eye lands on it instead of on the card it sits under. */
  highlight?: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** The server re-derives claim ownership and compatible canonical identity.
   * Deletes remain ordinary user-scoped writes under the existing RLS rule. */
  const run = async (write: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setBusy(true);
    setError(null);
    const result = await write();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  const key = { season, summoner_name: summonerName, tag };
  const actionInput = { season, summonerName, tag };

  const claimIt = () => run(() => requestCardClaim(actionInput));

  const approve = () => run(() => approveCardClaim(actionInput));

  const drop = () => run(async () => {
    const { error: writeError } = await supabase.from("card_claims").delete().match(key);
    return writeError ? { ok: false as const, error: writeError.message } : { ok: true as const };
  });

  const wrap = (children: React.ReactNode) => (
    <div
      className={`flex flex-col items-center gap-1 ${
        highlight ? "claim-highlight rounded-xl p-3 ring-2 ring-focus" : ""
      }`}
    >
      <div className="flex flex-wrap items-center justify-center gap-2">{children}</div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );

  if (!claim) {
    // Signed out, or someone who can already edit this card anyway — there is
    // nothing useful to offer either of them.
    if (!viewerProfileId || canModerate) return null;
    return wrap(
      <button type="button" onClick={() => void claimIt()} disabled={busy} className={ACTION}>
        This is me — claim this card
      </button>,
    );
  }

  const isClaimant = viewerProfileId !== null && claim.profileId === viewerProfileId;

  if (claim.status === "pending") {
    return wrap(
      <>
        <span className={`${CHIP} text-muted`}>Claim pending — waiting for a captain or admin</span>
        {isClaimant ? (
          <button type="button" onClick={() => void drop()} disabled={busy} className={ACTION}>
            Withdraw
          </button>
        ) : null}
        {canModerate ? (
          <>
            <button type="button" onClick={() => void approve()} disabled={busy} className="btn-primary px-4 py-1.5 text-xs disabled:opacity-40">
              Approve
            </button>
            <button type="button" onClick={() => void drop()} disabled={busy} className={ACTION}>
              Reject
            </button>
          </>
        ) : null}
      </>,
    );
  }

  return wrap(
    <>
      <span className={`${CHIP} text-mint`}>✓ Claimed by {claim.displayName ?? "a player"}</span>
      {canModerate ? (
        <button type="button" onClick={() => void drop()} disabled={busy} className={ACTION}>
          Revoke
        </button>
      ) : null}
    </>,
  );
}

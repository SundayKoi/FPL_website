"use client";

// "This is me" — the one line under a card that links a Discord login to a
// Riot identity. Nothing in the data connects the two (see the header of
// 20260826000017), so a player asks and an admin or their captain confirms.
//
// Deliberately a single quiet row of chips rather than a panel: on the vast
// majority of visits this card belongs to someone else and the claim state is
// trivia. Writes go straight from the client like SkinPicker's and RLS is what
// actually authorizes them — the props only decide what to draw. Once a claim
// is approved, can_edit_card_art starts returning true for the claimant and
// the customizer appears on the next refresh with no extra wiring.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type CardClaimState = {
  profileId: string;
  status: "pending" | "approved";
  displayName: string | null;
};

const CHIP = "rounded-full border border-line bg-panel px-3 py-1 text-xs";
const ACTION =
  "rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold uppercase tracking-wide text-steel transition hover:border-coral hover:text-coral disabled:opacity-40";

export default function CardClaim({
  season,
  summonerName,
  tag,
  viewerProfileId,
  canModerate,
  claim,
}: {
  season: string;
  summonerName: string;
  tag: string;
  viewerProfileId: string | null;
  canModerate: boolean;
  claim: CardClaimState | null;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Every action is one RLS'd write plus a refresh; the server re-derives
   *  the state (and the customizer's visibility) from the row. */
  const run = async (write: () => Promise<{ error: { message: string } | null }>) => {
    setBusy(true);
    setError(null);
    const { error: writeError } = await write();
    setBusy(false);
    if (writeError) {
      setError(writeError.message);
      return;
    }
    router.refresh();
  };

  const key = { season, summoner_name: summonerName, tag };

  const claimIt = () =>
    run(async () => await supabase.from("card_claims").insert({ ...key, profile_id: viewerProfileId }));

  const approve = () =>
    run(
      async () =>
        await supabase
          .from("card_claims")
          .update({ status: "approved", decided_by: viewerProfileId, decided_at: new Date().toISOString() })
          .match(key),
    );

  const drop = () => run(async () => await supabase.from("card_claims").delete().match(key));

  const wrap = (children: React.ReactNode) => (
    <div className="flex flex-col items-center gap-1">
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
        <span className={`${CHIP} text-steel`}>Claim pending — waiting for a captain or admin</span>
        {isClaimant ? (
          <button type="button" onClick={() => void drop()} disabled={busy} className={ACTION}>
            Withdraw
          </button>
        ) : null}
        {canModerate ? (
          <>
            <button type="button" onClick={() => void approve()} disabled={busy} className="btn-coral px-4 py-1.5 text-xs disabled:opacity-40">
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

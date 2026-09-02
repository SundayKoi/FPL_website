"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  requestPlayerIdentityClaim,
  withdrawPlayerIdentityClaim,
} from "@/lib/players/identityActions";
import type { LeagueKey } from "@/lib/players/identity";

export type PlayerRosterClaimState =
  | "unclaimed"
  | "pending"
  | "claimed"
  | "mine-pending"
  | "mine-approved";

const ACTION =
  "rounded-full border border-border-strong px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-muted transition hover:border-action-text hover:text-action-text disabled:opacity-40";

export default function PlayerRosterClaim({
  playerPoolId,
  leagueTeamId,
  league,
  season,
  returnPath,
  signedIn,
  state,
  claimLinkId,
  unavailable,
}: {
  playerPoolId: string | null;
  leagueTeamId: string;
  league: LeagueKey;
  season: string;
  returnPath: string;
  signedIn: boolean;
  state: PlayerRosterClaimState;
  claimLinkId: string | null;
  unavailable: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!playerPoolId) return null;

  const run = async (action: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  let content: React.ReactNode;
  if (unavailable) {
    content = (
      <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted">
        Claim status unavailable — try again
      </span>
    );
  } else if (state === "claimed") {
    content = <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-success">Claimed</span>;
  } else if (state === "pending") {
    content = <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted">Pending</span>;
  } else if (state === "mine-approved") {
    content = <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-success">This is you</span>;
  } else if (state === "mine-pending") {
    content = (
      <div className="flex items-center gap-2">
        <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted">Your claim is pending</span>
        {claimLinkId ? (
          <button
            type="button"
            className={ACTION}
            disabled={busy}
            onClick={() => void run(() => withdrawPlayerIdentityClaim(claimLinkId))}
          >
            Withdraw
          </button>
        ) : null}
      </div>
    );
  } else if (!signedIn) {
    content = (
      <Link href={`/login?redirect=${returnPath}`} className={ACTION}>
        Sign in to claim
      </Link>
    );
  } else {
    content = (
      <button
        type="button"
        className={ACTION}
        disabled={busy}
        onClick={() => void run(() => requestPlayerIdentityClaim({
          playerPoolId,
          leagueTeamId,
          league,
          season,
        }))}
      >
        Claim this roster spot
      </button>
    );
  }

  return (
    <div className="ml-auto flex min-w-fit flex-col items-end gap-1">
      {content}
      {error ? <p className="max-w-48 text-right text-[0.65rem] text-red-400">{error}</p> : null}
    </div>
  );
}

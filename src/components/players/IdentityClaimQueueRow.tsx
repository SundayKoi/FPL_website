"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { decidePlayerIdentityClaim } from "@/lib/players/identityActions";

const ACTION =
  "rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold uppercase tracking-wide text-steel transition hover:border-coral hover:text-coral disabled:opacity-40";

const SOURCE_LABELS = {
  team: "team page",
  card: "player card",
  admin: "admin assignment",
} as const;

export default function IdentityClaimQueueRow({
  linkId,
  teamName,
  playerName,
  claimantName,
  source,
  requestedLabel,
}: {
  linkId: string;
  teamName: string;
  playerName: string;
  claimantName: string;
  source: keyof typeof SOURCE_LABELS;
  requestedLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: "approve" | "reject") => {
    setBusy(true);
    setError(null);
    const result = await decidePlayerIdentityClaim({ linkId, decision });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-panel px-4 py-3">
      <div className="min-w-0">
        <p className="font-semibold text-white">{playerName}</p>
        <p className="mt-0.5 text-xs text-steel">{teamName} · {SOURCE_LABELS[source]} · {requestedLabel}</p>
        <p className="mt-0.5 text-xs text-steel">claimed by {claimantName}</p>
        {error ? <p className="mt-1 text-xs text-red-400">{error}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-coral px-4 py-1.5 text-xs disabled:opacity-40"
          disabled={busy}
          onClick={() => void decide("approve")}
        >
          Approve
        </button>
        <button type="button" className={ACTION} disabled={busy} onClick={() => void decide("reject")}>
          Reject
        </button>
      </div>
    </div>
  );
}

"use client";

// One pending claim in the approvals queue, with the two decisions attached.
//
// Approval uses the same atomic server action as CardClaim; rejection remains
// an RLS'd delete keyed by the claim's composite primary key. What's different
// here is the setting: a stranger's name next to a card you may not recognize,
// ten in a row, so Reject asks twice before it throws a claim away (approving
// is recoverable — revoke on the card page; a deleted claim is gone and the
// player must ask again).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { approveCardClaim } from "@/lib/cards/claimActions";
import { createClient } from "@/lib/supabase/client";

const ACTION =
  "rounded-full border border-border-strong bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted transition hover:border-action-text hover:text-action-text disabled:opacity-40";

export default function ClaimQueueRow({
  season,
  summonerName,
  tag,
  slug,
  claimantName,
  createdLabel,
}: {
  season: string;
  summonerName: string;
  tag: string;
  slug: string;
  claimantName: string;
  createdLabel: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** One authorized mutation plus a refresh; the server re-derives the queue,
   * so an approved or rejected row simply leaves the list. */
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

  const approve = () => run(() => approveCardClaim({ season, summonerName, tag }));

  const reject = () => {
    if (!confirmReject) {
      setConfirmReject(true);
      return;
    }
    setConfirmReject(false);
    void run(async () => {
      const { error: writeError } = await supabase.from("card_claims").delete().match(key);
      return writeError ? { ok: false as const, error: writeError.message } : { ok: true as const };
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface px-4 py-3">
      <div className="min-w-0">
        <Link href={`/card/${slug}`} className="font-semibold text-white underline-offset-4 hover:text-action-text hover:underline">
          {summonerName}
          <span className="text-muted">#{tag}</span>
        </Link>
        <p className="mt-0.5 text-xs text-muted">
          claimed by {claimantName} · {createdLabel}
        </p>
        {error ? <p className="mt-1 text-xs text-red-400">{error}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => void approve()} disabled={busy} className="btn-primary px-4 py-1.5 text-xs disabled:opacity-40">
          Approve
        </button>
        <button type="button" onClick={reject} disabled={busy} className={ACTION}>
          {confirmReject ? "Confirm reject" : "Reject"}
        </button>
      </div>
    </div>
  );
}

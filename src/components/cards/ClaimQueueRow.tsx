"use client";

// One pending claim in the approvals queue, with the two decisions attached.
//
// The writes are CardClaim's writes verbatim — an update to 'approved' and a
// delete, both keyed by the claim's composite primary key — because RLS is
// what actually authorizes them and the queue must not invent a second
// shape for the same act. What's different here is the setting: a stranger's
// name next to a card you may not recognize, ten in a row, so Reject asks
// twice before it throws a claim away (approving is recoverable — revoke on
// the card page; a deleted claim is gone and the player must ask again).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const ACTION =
  "rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold uppercase tracking-wide text-steel transition hover:border-coral hover:text-coral disabled:opacity-40";

export default function ClaimQueueRow({
  season,
  summonerName,
  tag,
  slug,
  claimantName,
  createdLabel,
  viewerProfileId,
}: {
  season: string;
  summonerName: string;
  tag: string;
  slug: string;
  claimantName: string;
  createdLabel: string;
  viewerProfileId: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** One RLS'd write plus a refresh; the server re-derives the queue, so an
   *  approved or rejected row simply leaves the list. */
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

  const approve = () =>
    run(
      async () =>
        await supabase
          .from("card_claims")
          .update({ status: "approved", decided_by: viewerProfileId, decided_at: new Date().toISOString() })
          .match(key),
    );

  const reject = () => {
    if (!confirmReject) {
      setConfirmReject(true);
      return;
    }
    setConfirmReject(false);
    void run(async () => await supabase.from("card_claims").delete().match(key));
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-panel px-4 py-3">
      <div className="min-w-0">
        <Link href={`/card/${slug}`} className="font-semibold text-white underline-offset-4 hover:text-coral hover:underline">
          {summonerName}
          <span className="text-steel">#{tag}</span>
        </Link>
        <p className="mt-0.5 text-xs text-steel">
          claimed by {claimantName} · {createdLabel}
        </p>
        {error ? <p className="mt-1 text-xs text-red-400">{error}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => void approve()} disabled={busy} className="btn-coral px-4 py-1.5 text-xs disabled:opacity-40">
          Approve
        </button>
        <button type="button" onClick={reject} disabled={busy} className={ACTION}>
          {confirmReject ? "Confirm reject" : "Reject"}
        </button>
      </div>
    </div>
  );
}

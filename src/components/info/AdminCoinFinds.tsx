"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export interface CoinFinder {
  profile_id: string;
  found_at: string;
  display_name: string;
}

/**
 * Admin panel for the hidden-coin contest: finders in order (top 3
 * crowned), with per-row removal — e.g. staff clearing their own test
 * click before announcing the hunt. Delete is admin-gated by RLS
 * (20260812000004_coin_hunt.sql).
 */
export default function AdminCoinFinds({ finders }: { finders: CoinFinder[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async (profileId: string) => {
    setBusyId(profileId);
    setError(null);
    const { error: deleteError } = await supabase
      .from("coin_finds")
      .delete()
      .eq("profile_id", profileId);
    setBusyId(null);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    router.refresh();
  };

  return (
    <section aria-label="Coin hunt finders" className="card-brand mt-10 p-5">
      <span className="label-dash">Admin — hidden coin finders</span>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
      {finders.length === 0 ? (
        <p className="mt-2 text-sm text-steel">Nobody has found the coin yet.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-1.5">
          {finders.map((finder, i) => (
            <li key={finder.profile_id} className="flex items-center gap-3 text-sm">
              <span className={`w-8 shrink-0 font-bold ${i < 3 ? "text-gold" : "text-steel"}`}>
                #{i + 1}
              </span>
              <span className={i < 3 ? "font-semibold text-white" : "text-steel"}>
                {finder.display_name}
              </span>
              {i < 3 && <span aria-hidden="true">🏆</span>}
              <span className="ml-auto shrink-0 text-xs text-steel">
                {new Date(finder.found_at).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
              <button
                type="button"
                onClick={() => void handleDelete(finder.profile_id)}
                disabled={busyId !== null}
                aria-label={`Remove ${finder.display_name}'s find`}
                className="shrink-0 rounded-full border border-red-400/40 bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-400 disabled:opacity-50"
              >
                {busyId === finder.profile_id ? "Removing…" : "Remove"}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

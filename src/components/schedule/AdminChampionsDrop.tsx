"use client";

// The owner's switch for the Faceless Drop — the S4 champions' Hand goes
// on sale in the premier shop while the window runs. Owner-only (the
// action re-checks): a commemorative set is a league-history call, and
// once the vault shuts the scarcity is meant to be permanent.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setChampionsWindowAction } from "@/lib/packs/admin-actions";

const DAYS = [3, 5, 7] as const;

export default function AdminChampionsDrop({
  until,
  active,
}: {
  until: string | null;
  /** Server-decided, same reasoning as AdminLiveDrops: Date.now() in a
   *  component body is impure, and a chip one refresh behind is fine. */
  active: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Two-tap on End: closing the vault early is the one destructive act. */
  const [endArmed, setEndArmed] = useState(false);

  const write = async (input: Parameters<typeof setChampionsWindowAction>[0]) => {
    setBusy(true);
    setError(null);
    const result = await setChampionsWindowAction(input);
    setBusy(false);
    setEndArmed(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <div className="card-brand flex flex-wrap items-end gap-3 p-4">
      <div className="flex flex-col gap-1">
        <span className="label-dash">The Faceless Drop</span>
        <span className={`text-xs font-semibold ${active ? "text-[#ff6b76]" : "text-steel"}`}>
          {active
            ? `OPEN — vault shuts ${new Date(until!).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}`
            : "Vault shut — the Hand isn't for sale"}
        </span>
      </div>
      {DAYS.map((days) => (
        <button
          key={days}
          type="button"
          disabled={busy}
          onClick={() => void write({ days })}
          className="rounded-full border border-[#d61f2c]/70 bg-[#d61f2c]/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#ff6b76] disabled:opacity-50"
        >
          Open {days}d
        </button>
      ))}
      {active ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => (endArmed ? void write({ end: true }) : setEndArmed(true))}
          className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-steel disabled:opacity-50"
        >
          {endArmed ? "Shut the vault — sure?" : "End now"}
        </button>
      ) : null}
      {error ? <p className="w-full text-xs text-red-400">{error}</p> : null}
    </div>
  );
}

"use client";

// Admin switch for the Live Drops window — open it when the broadcast
// starts, and packs opened while it runs roll boosted foil and take the
// LIVE stamp. Same direct-update pattern as AdminSeasonSettings beside it:
// league_settings is RLS'd to admins, so the client write IS the
// authorization check.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminInputClass } from "@/components/matches/CollapsibleAdminSection";
import { createClient } from "@/lib/supabase/client";

const HOURS = [2, 3, 4] as const;

export default function AdminLiveDrops({
  liveUntil,
  liveLabel,
  active,
}: {
  liveUntil: string | null;
  liveLabel: string | null;
  /** Whether the window is open, decided by the server render — the
   *  compiler is right that Date.now() in a component body is impure, and
   *  a status chip a refresh behind is fine for an admin control. */
  active: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [label, setLabel] = useState(liveLabel ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const write = async (patch: { live_until: string | null; live_label: string | null }) => {
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.from("league_settings").update(patch).eq("id", 1);
    setBusy(false);
    if (updateError) {
      setError("Could not update the live window.");
      return;
    }
    router.refresh();
  };

  return (
    <div className="card-brand flex flex-wrap items-end gap-3 p-4">
      <div className="flex flex-col gap-1">
        <span className="label-dash">Live drops</span>
        <span className={`text-xs font-semibold ${active ? "text-red-300" : "text-steel"}`}>
          {active
            ? `LIVE until ${new Date(liveUntil!).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET`
            : "Off — packs roll normal foil odds"}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="live-label" className="label-dash">
          Window label
        </label>
        <input
          id="live-label"
          type="text"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Week 3 broadcast"
          className={adminInputClass}
        />
      </div>
      {HOURS.map((hours) => (
        <button
          key={hours}
          type="button"
          disabled={busy}
          onClick={() =>
            void write({
              live_until: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
              live_label: label.trim() || null,
            })
          }
          className="rounded-full border border-red-400/60 bg-red-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-red-300 disabled:opacity-50"
        >
          Go live {hours}h
        </button>
      ))}
      {active ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void write({ live_until: null, live_label: null })}
          className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-steel disabled:opacity-50"
        >
          End now
        </button>
      ) : null}
      {error ? <p className="w-full text-xs text-red-400">{error}</p> : null}
    </div>
  );
}

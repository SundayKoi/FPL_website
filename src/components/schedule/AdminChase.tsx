"use client";

// Arm the Weekly Chase from the admin strip — replacing the SQL file as
// the everyday path. The form's whole job is removing the two ways the
// SQL could go quietly wrong: the week (always the newest edition, derived
// server-side, never typed) and the criteria (presets, never hand-written
// jsonb). Arming announces to the Discord cards channel.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminInputClass } from "@/components/matches/CollapsibleAdminSection";
import { armChaseAction } from "@/lib/packs/admin-actions";
import { CHASE_PRESETS, type ChasePreset } from "@/lib/packs/chase";

const PRESET_LABELS: Record<ChasePreset, string> = {
  any: "First pull of the week — anything",
  foil: "Any foil",
  ice: "Any Cracked Ice",
  signed: "Any signed pull",
  player: "A specific player…",
  tier: "A specific tier…",
};

const TIERS = ["bronze", "silver", "gold", "platinum", "emerald", "diamond", "master", "grandmaster", "challenger"];

export default function AdminChase({
  /** The standing chase for the newest edition, if one is armed. */
  current,
}: {
  current: { title: string; claimedBy: string | null } | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [bounty, setBounty] = useState("500");
  const [preset, setPreset] = useState<ChasePreset>("foil");
  const [parameter, setParameter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const arm = async () => {
    setBusy(true);
    setError(null);
    const result = await armChaseAction({ title, bounty: Number(bounty) || 0, preset, parameter });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setTitle("");
    router.refresh();
  };

  return (
    <div className="card-brand flex flex-wrap items-end gap-3 p-4">
      <div className="flex flex-col gap-1">
        <span className="label-dash">Weekly chase</span>
        <span className="text-xs font-semibold text-steel">
          {current
            ? current.claimedBy
              ? `"${current.title}" — taken by ${current.claimedBy}`
              : `"${current.title}" — still standing`
            : "Nothing armed for this week's edition"}
        </span>
      </div>
      {!current ? (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor="chase-title" className="label-dash">
              Title
            </label>
            <input
              id="chase-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Any foil jungle card"
              className={adminInputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="chase-preset" className="label-dash">
              What wins it
            </label>
            <select
              id="chase-preset"
              value={preset}
              onChange={(event) => setPreset(event.target.value as ChasePreset)}
              className={adminInputClass}
            >
              {CHASE_PRESETS.map((key) => (
                <option key={key} value={key}>
                  {PRESET_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
          {preset === "player" ? (
            <div className="flex flex-col gap-1">
              <label htmlFor="chase-player" className="label-dash">
                Card slug
              </label>
              <input
                id="chase-player"
                type="text"
                value={parameter}
                onChange={(event) => setParameter(event.target.value)}
                placeholder="doug-na1"
                className={adminInputClass}
              />
            </div>
          ) : null}
          {preset === "tier" ? (
            <div className="flex flex-col gap-1">
              <label htmlFor="chase-tier" className="label-dash">
                Tier
              </label>
              <select
                id="chase-tier"
                value={parameter}
                onChange={(event) => setParameter(event.target.value)}
                className={adminInputClass}
              >
                <option value="">Pick a tier</option>
                {TIERS.map((tier) => (
                  <option key={tier} value={tier}>
                    {tier}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <label htmlFor="chase-bounty" className="label-dash">
              Bounty
            </label>
            <input
              id="chase-bounty"
              type="number"
              min={0}
              max={10000}
              value={bounty}
              onChange={(event) => setBounty(event.target.value)}
              className={`${adminInputClass} w-24`}
            />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void arm()}
            className="rounded-full border border-gold/60 bg-gold/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gold disabled:opacity-50"
          >
            Arm &amp; announce
          </button>
        </>
      ) : null}
      {error ? <p className="w-full text-xs text-red-400">{error}</p> : null}
    </div>
  );
}

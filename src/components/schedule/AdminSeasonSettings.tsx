"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminInputClass } from "@/components/matches/CollapsibleAdminSection";
import { createClient } from "@/lib/supabase/client";

const PHASES = ["Regular", "Playoffs"] as const;
export type LeaguePhase = (typeof PHASES)[number];

/**
 * Admin control over league_settings.current_season/current_phase — the
 * values automated stats ingestion (riot_stats_ingest.py without
 * --season/--phase flags) stamps onto rows. Lives on the schedule page next
 * to the fixtures editor so split management happens in one place.
 */
export default function AdminSeasonSettings({
  currentSeason,
  currentPhase,
  academySeason,
}: {
  currentSeason: string;
  currentPhase: string;
  academySeason: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [season, setSeason] = useState(currentSeason);
  const [phase, setPhase] = useState(currentPhase);
  const [academy, setAcademy] = useState(academySeason);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    const trimmed = season.trim();
    const academyTrimmed = academy.trim();
    if (!trimmed) {
      setError("Season can't be blank.");
      return;
    }
    if (!academyTrimmed) {
      setError("Academy season can't be blank.");
      return;
    }
    if (academyTrimmed === trimmed) {
      setError("Academy needs its own season code — sharing one merges the two leagues' stats.");
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    const { error: updateError } = await supabase.from("league_settings").upsert({
      id: 1,
      current_season: trimmed,
      current_phase: phase,
      academy_season: academyTrimmed,
      updated_at: new Date().toISOString(),
    });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSaved(true);
    router.refresh();
  };

  return (
    <div className="card-brand flex flex-wrap items-end gap-3 p-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="current-season" className="label-dash">
          Current season
        </label>
        <input
          id="current-season"
          type="text"
          value={season}
          onChange={(e) => {
            setSeason(e.target.value);
            setSaved(false);
          }}
          placeholder="S5"
          className={`w-24 ${adminInputClass}`}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="academy-season" className="label-dash">
          Academy season
        </label>
        <input
          id="academy-season"
          type="text"
          value={academy}
          onChange={(e) => {
            setAcademy(e.target.value);
            setSaved(false);
          }}
          placeholder="A1"
          className={`w-24 ${adminInputClass}`}
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="label-dash">Current phase</span>
        <div className="flex gap-1">
          {PHASES.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={phase === p}
              onClick={() => {
                setPhase(p);
                setSaved(false);
              }}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                phase === p ? "bg-coral text-navy" : "border border-line bg-panel text-steel hover:text-white"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={busy}
        className="rounded-full bg-coral px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-navy disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save"}
      </button>

      {saved && <span className="text-xs font-semibold text-mint">Saved</span>}
      {error && (
        <p role="alert" className="w-full text-sm text-red-400">
          {error}
        </p>
      )}

      <p className="w-full text-xs text-steel">
        Stats ingestion runs without <code>--season</code>/<code>--phase</code> flags use these
        values, so automated match imports get labeled correctly. Academy rows carry the Academy
        season instead, which is what keeps the two leagues&apos; stats and season pickers apart.
      </p>
    </div>
  );
}

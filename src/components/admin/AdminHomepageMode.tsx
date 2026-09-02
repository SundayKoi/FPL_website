"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { HomepageMode } from "@/lib/home/seasonState";

const OPTIONS: Array<{ value: HomepageMode; label: string; description: string }> = [
  { value: "auto", label: "Automatic", description: "Follows the calendar and switches on opening day." },
  { value: "preseason", label: "Preseason", description: "Show the draft briefing and available player pool." },
  { value: "regular", label: "Regular season", description: "Show the broadcast, standings, awards, and schedule." },
];

export default function AdminHomepageMode({ homepageMode }: { homepageMode: HomepageMode }) {
  const supabase = createClient();
  const router = useRouter();
  const [mode, setMode] = useState(homepageMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveMode = async (nextMode: HomepageMode) => {
    if (busy || nextMode === mode) return;
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.from("league_settings").upsert({
      id: 1,
      homepage_mode: nextMode,
      updated_at: new Date().toISOString(),
    });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMode(nextMode);
    router.refresh();
  };

  return (
    <div className="card-brand flex flex-col gap-4 p-5">
      <div>
        <span className="label-dash">Homepage display</span>
        <p className="mt-1 text-sm text-muted">Choose which homepage visitors see. Automatic follows the published season calendar.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Homepage display mode">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={mode === option.value}
            disabled={busy}
            onClick={() => void saveMode(option.value)}
            className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] transition disabled:opacity-50 ${
              mode === option.value ? "bg-action-fill text-white" : "border border-border-subtle bg-surface text-muted hover:text-white"
            }`}
          >
            {busy && mode !== option.value ? "Saving…" : option.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">{OPTIONS.find((option) => option.value === mode)?.description}</p>
      {error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}
    </div>
  );
}

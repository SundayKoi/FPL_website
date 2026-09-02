"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { BangerBoardSettings } from "@/lib/bangers/settings";

const FIELDS: Array<{ key: keyof BangerBoardSettings; label: string }> = [
  { key: "heroTitle", label: "Hero title" },
  { key: "dailyTitle", label: "Daily check" },
  { key: "podiumTitle", label: "Top 3 leaderboard" },
  { key: "stinkerTitle", label: "Stinker leaderboard" },
  { key: "recentTitle", label: "Recent feed" },
  { key: "randomTitle", label: "Random pull" },
];

export default function AdminBangerTitles({ initial }: { initial: BangerBoardSettings }) {
  const supabase = createClient();
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    if (busy || Object.values(values).some((value) => !value.trim() || value.length > 80)) {
      setMessage("Each title is required and must be 80 characters or fewer.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.from("banger_board_settings").upsert({
      id: true,
      hero_title: values.heroTitle.trim(),
      daily_title: values.dailyTitle.trim(),
      podium_title: values.podiumTitle.trim(),
      stinker_title: values.stinkerTitle.trim(),
      recent_title: values.recentTitle.trim(),
      random_title: values.randomTitle.trim(),
      updated_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) {
      setMessage("Could not save titles. Please try again.");
      return;
    }
    setMessage("The Daily Stu titles saved.");
    router.refresh();
  }

  return (
    <details className="card-brand flex flex-col gap-5 p-5">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="label-dash">The Daily Stu titles</span>
        <p className="mt-1 text-sm text-muted">Customize the headings shown to every visitor.</p>
      </summary>
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map(({ key, label }) => (
          <label key={key} className="flex flex-col gap-1.5 text-sm text-muted">
            {label}
            <input
              value={values[key]}
              maxLength={80}
              onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-white outline-none focus:border-primary"
            />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => void save()} disabled={busy} className="rounded-full bg-primary px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-white disabled:opacity-50">
          {busy ? "Saving…" : "Save titles"}
        </button>
        {message ? <p className="text-sm text-muted" role="status">{message}</p> : null}
      </div>
    </details>
  );
}

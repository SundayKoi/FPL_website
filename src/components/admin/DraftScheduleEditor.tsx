"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatEasternDateTime, formatEasternInputValue, parseEasternInputValue } from "@/lib/draft/schedule";
import type { Draft } from "@/lib/draft/types";

export default function DraftScheduleEditor({
  draft,
  onSaved,
}: {
  draft: Draft;
  onSaved: (startsAt: string | null) => void;
}) {
  const supabase = createClient();
  const startsAt = draft.starts_at ?? null;
  const [value, setValue] = useState(() => formatEasternInputValue(startsAt));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async (nextValue: string | null) => {
    setSaving(true);
    setMessage(null);
    setError(null);
    const { error: updateError } = await supabase
      .from("drafts")
      .update({ starts_at: nextValue })
      .eq("id", draft.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setValue(nextValue ? formatEasternInputValue(nextValue) : "");
    onSaved(nextValue);
    setMessage("Schedule saved.");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!value) {
      await save(null);
      return;
    }
    const parsed = parseEasternInputValue(value);
    if ("error" in parsed) {
      setError(parsed.error);
      setMessage(null);
      return;
    }
    await save(parsed.iso);
  };

  return (
    <section className="card-brand flex flex-col gap-4 p-5" aria-labelledby="draft-schedule-title">
      <div>
        <span className="label-dash text-coral">SCHEDULE</span>
        <h2 id="draft-schedule-title" className="type-display mt-2 text-2xl text-white">
          Draft start time
        </h2>
        <p className="mt-2 text-sm leading-6 text-steel">
          Set when the spectator preview should become draft night. Times are entered in Eastern Time.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5 text-sm font-semibold text-white">
          Draft start (Eastern Time)
          <input
            type="datetime-local"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="rounded border border-line bg-navy px-3 py-2 text-sm text-white focus:border-coral focus:outline-none"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-coral px-4 py-2 text-sm font-display font-bold not-italic text-navy hover:brightness-110 disabled:opacity-40"
          >
            Save schedule
          </button>
          <button
            type="button"
            disabled={saving || !startsAt}
            onClick={() => void save(null)}
            className="rounded border border-line px-4 py-2 text-sm font-semibold text-steel hover:border-coral hover:text-coral disabled:opacity-40"
          >
            Clear schedule
          </button>
        </div>
      </form>

      {startsAt && <p className="text-xs text-steel">Current: {formatEasternDateTime(startsAt)}</p>}
      {message && <p className="text-sm text-mint">{message}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </section>
  );
}

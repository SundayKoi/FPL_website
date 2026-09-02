"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type DraftOption = { id: string; name: string };

export default function FeaturedDraftSelector({
  drafts,
  premierDraftId,
  academyDraftId,
}: {
  drafts: DraftOption[];
  premierDraftId: string | null;
  academyDraftId: string | null;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectDraft = async (column: "featured_draft_id" | "academy_draft_id", draftId: string | null) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.from("league_settings").upsert({
      id: 1,
      [column]: draftId,
      updated_at: new Date().toISOString(),
    });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  };

  const draftSelect = (id: string, label: string, value: string | null, column: "featured_draft_id" | "academy_draft_id") => (
    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor={id}>
      {label}
      <select
        id={id}
        value={value ?? ""}
        disabled={busy}
        onChange={(event) => void selectDraft(column, event.target.value || null)}
        className="min-w-48 rounded border border-border bg-surface px-3 py-2 text-sm font-semibold normal-case tracking-normal text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
      >
        <option value="">— preview placeholders —</option>
        {drafts.map((draft) => (
          <option key={draft.id} value={draft.id}>
            {draft.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="flex flex-wrap items-end gap-2">
      {draftSelect("premier-draft", "Premier draft", premierDraftId, "featured_draft_id")}
      {draftSelect("academy-draft", "Academy draft", academyDraftId, "academy_draft_id")}
      {error ? (
        <p role="alert" className="max-w-xs text-xs text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

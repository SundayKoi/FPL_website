"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type DraftOption = { id: string; name: string };

export default function FeaturedDraftSelector({
  drafts,
  selectedDraftId,
}: {
  drafts: DraftOption[];
  selectedDraftId: string | null;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectDraft = async (featuredDraftId: string | null) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.from("league_settings").upsert({
      id: 1,
      featured_draft_id: featuredDraftId,
      updated_at: new Date().toISOString(),
    });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="featured-draft" className="label-dash">
        Display draft
      </label>
      <select
        id="featured-draft"
        value={selectedDraftId ?? ""}
        disabled={busy}
        onChange={(event) => void selectDraft(event.target.value || null)}
        className="min-w-56 rounded border border-line bg-panel px-3 py-2 text-sm font-semibold text-white focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold disabled:opacity-50"
      >
        <option value="">— preview placeholders —</option>
        {drafts.map((draft) => (
          <option key={draft.id} value={draft.id}>
            {draft.name}
          </option>
        ))}
      </select>
      {error ? (
        <p role="alert" className="max-w-xs text-xs text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

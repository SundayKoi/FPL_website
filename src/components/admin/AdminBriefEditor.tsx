"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { stripAiTells, type HomepageBrief } from "@/lib/home/brief";

const SECTIONS = [
  ["recap", "Week in review"],
  ["preview", "Next week"],
  ["players_note", "Players setting the pace"],
  ["teams_note", "Franchises on the move"],
  ["league_notes", "Around the league"],
] as const;

type SectionKey = (typeof SECTIONS)[number][0];

/** Edit or pull the week's generated copy. Unpublishing falls the homepage
 *  back to the previous week's brief, or to the computed award lists. */
export default function AdminBriefEditor({ brief }: { brief: HomepageBrief | null }) {
  const supabase = createClient();
  const router = useRouter();
  const [draft, setDraft] = useState<Record<SectionKey, string>>(() =>
    Object.fromEntries(SECTIONS.map(([key]) => [key, brief?.[key] ?? ""])) as Record<
      SectionKey,
      string
    >
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!brief) {
    return (
      <section className="card-brand flex flex-col gap-2 p-4">
        <h2 className="label-dash">This week&apos;s write-up</h2>
        <p className="text-sm text-muted">
          Nothing generated yet. The job runs Tuesday mornings once a week of games has been
          played and ingested. Until then the homepage shows the calculated award lists.
        </p>
      </section>
    );
  }

  const save = async (patch: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    setSaved(false);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("homepage_briefs")
      .update({ ...patch, edited_by: userData.user?.id ?? null, edited_at: new Date().toISOString() })
      .eq("id", brief.id);
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setSaved(true);
    router.refresh();
  };

  return (
    <section className="card-brand flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="label-dash">This week&apos;s write-up</h2>
        <span className="text-xs text-muted">
          {brief.model ?? "generated"}
          {brief.week != null ? ` · after week ${brief.week}` : ""}
          {brief.published ? "" : " · not published"}
        </span>
      </div>
      {err && <p className="text-sm text-red-400">{err}</p>}
      {saved && <p className="text-sm text-mint">Saved.</p>}

      {SECTIONS.map(([key, label]) => (
        <label key={key} className="flex flex-col gap-1 text-xs text-muted">
          {label}
          <textarea
            value={draft[key]}
            onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            rows={3}
            aria-label={label}
            className="input-brand px-2 py-1 text-sm"
          />
        </label>
      ))}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            // Run the same clean-up on hand-edited text, so an em dash typed
            // here does not survive either.
            void save(Object.fromEntries(SECTIONS.map(([key]) => [key, stripAiTells(draft[key])])))
          }
          className="btn-primary px-3 py-1.5 text-xs"
        >
          Save changes
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (
              brief.published &&
              !confirm("Unpublish this week? The homepage falls back to the previous week.")
            ) return;
            void save({ published: !brief.published });
          }}
          className="rounded border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-primary disabled:opacity-40"
        >
          {brief.published ? "Unpublish" : "Publish"}
        </button>
      </div>
    </section>
  );
}

"use client";

// When a week drafts and when its games are played, entered in Eastern Time
// like the league's draft schedule. The week's auctions count down to the
// draft time (offseason_set_week_times moves them with it).

import { useState } from "react";
import { formatEasternInputValue, parseEasternInputValue } from "@/lib/draft/schedule";
import { setWeekTimesAction } from "@/lib/offseason/actions";
import type { OffseasonWeek } from "@/lib/offseason/types";
import { ActionMessage, buttonClass, inputClass, labelClass, useOffseasonAction } from "./shared";

/** An empty input clears the time; anything else must be a real Eastern date and time. */
function parse(value: string): { iso: string | null } | { error: string } {
  return value ? parseEasternInputValue(value) : { iso: null };
}

export default function WeekTimesEditor({ week }: { week: OffseasonWeek }) {
  const { pending, message, setMessage, run } = useOffseasonAction();
  const [draft, setDraft] = useState(() => formatEasternInputValue(week.draft_at));
  const [games, setGames] = useState(() => formatEasternInputValue(week.games_at));

  const save = () => {
    const draftAt = parse(draft);
    const gamesAt = parse(games);
    if ("error" in draftAt) {
      setMessage({ kind: "error", text: `Draft: ${draftAt.error}` });
      return;
    }
    if ("error" in gamesAt) {
      setMessage({ kind: "error", text: `Games: ${gamesAt.error}` });
      return;
    }
    if (draftAt.iso && gamesAt.iso && draftAt.iso > gamesAt.iso) {
      setMessage({ kind: "error", text: "The draft has to be before the games." });
      return;
    }
    run(() => setWeekTimesAction(week.id, draftAt.iso, gamesAt.iso), "Times saved.");
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">Times (Eastern)</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className={labelClass}>
          Draft
          <input type="datetime-local" value={draft} onChange={(e) => setDraft(e.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          Games
          <input type="datetime-local" value={games} onChange={(e) => setGames(e.target.value)} className={inputClass} />
        </label>
        <button type="button" disabled={pending} className={buttonClass} onClick={save}>
          Save times
        </button>
        <ActionMessage message={message} />
      </div>
      <p className="text-xs text-muted">Shown on the offseason pages and the homepage. The week&apos;s drafts count down to the draft time.</p>
    </div>
  );
}

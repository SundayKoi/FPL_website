"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateRegularSeason, type GeneratorTeam } from "@/lib/schedule/generate";

/** Draws a random intra-division regular season for the featured draft's teams:
 *  inside each division everyone plays everyone once, one match per team per
 *  week, across the five regular-season weeks. */
export default function AdminGenerateSchedule({ season }: { season: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [startDate, setStartDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const generate = async () => {
    if (busy) return;
    setErr(null);
    setDone(null);

    const { data: settings } = await supabase
      .from("league_settings")
      .select("featured_draft_id")
      .eq("id", 1)
      .single();
    const draftId = (settings as { featured_draft_id?: string | null } | null)?.featured_draft_id;
    if (!draftId) {
      setErr("No featured draft is set, so there are no teams to schedule.");
      return;
    }

    const { data: teamRows, error: teamsError } = await supabase
      .from("teams")
      .select("name, division")
      .eq("draft_id", draftId);
    if (teamsError) {
      setErr(teamsError.message);
      return;
    }

    let fixtures;
    try {
      fixtures = generateRegularSeason((teamRows as GeneratorTeam[]) ?? [], {
        // Parsed without a Z so it is read in your own timezone. Appending Z
        // made a Monday kickoff land at midnight UTC, which the site renders
        // as 8pm the Sunday before.
        startsAt: startDate ? new Date(startDate) : null,
      });
    } catch (e) {
      // Thrown for missing divisions, duplicate names, or a division too big
      // for five weeks — all worth showing verbatim.
      setErr(e instanceof Error ? e.message : String(e));
      return;
    }

    if (
      !confirm(
        `Replace weeks 1-5 of ${season} with ${fixtures.length} freshly drawn matches? ` +
          `Existing regular-season fixtures for this season, including any scores, are deleted.`
      )
    ) return;

    setBusy(true);
    // Replace rather than append: generating twice would otherwise double the
    // season. Only the five regular-season weeks are touched — gauntlet and
    // playoff fixtures stay.
    const { error: deleteError } = await supabase
      .from("fixtures")
      .delete()
      .eq("season", season)
      .in("stage", ["week_1", "week_2", "week_3", "week_4", "week_5"]);
    if (deleteError) {
      setBusy(false);
      setErr(deleteError.message);
      return;
    }

    const { error: insertError } = await supabase
      .from("fixtures")
      .insert(fixtures.map((f) => ({ ...f, season })));
    setBusy(false);
    if (insertError) {
      setErr(insertError.message);
      return;
    }
    setDone(`Drew ${fixtures.length} matches across weeks 1-5.`);
    router.refresh();
  };

  return (
    <section className="card-brand flex flex-col gap-3 p-4">
      <div>
        <h2 className="label-dash">Generate regular season</h2>
        <p className="mt-1 text-xs text-steel">
          Random draw for {season}. Every team plays each other team in its own division once,
          one match per week.
        </p>
      </div>
      {err && <p className="text-sm text-red-400">{err}</p>}
      {done && <p className="text-sm text-mint">{done}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-steel">
          Week 1 kickoff (optional)
          <input
            type="datetime-local"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            aria-label="Week 1 kickoff"
            className="rounded border border-line bg-navy px-2 py-1 text-sm text-white focus:border-coral focus:outline-none"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void generate()}
          className="rounded bg-coral px-3 py-1.5 text-xs font-display font-bold not-italic text-navy hover:brightness-110 disabled:opacity-40"
        >
          {busy ? "Drawing…" : "Generate schedule"}
        </button>
      </div>
      <p className="text-xs text-steel">
        Set the first kickoff in your own time (the league plays Mondays 8pm ET). Later weeks
        fall on the same day and time, seven days apart. Leave it blank to schedule the matchups
        without kickoff times.
      </p>
    </section>
  );
}

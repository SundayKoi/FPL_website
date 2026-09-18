"use client";

// Draws the gauntlet onto the schedule instead of the admin typing four
// fixtures into the editor by hand. The seeds come from the same standings
// the site already publishes, so the bracket cannot disagree with the table
// it is drawn from. Premier only — the Academy has no gauntlet.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  drawGauntletAction,
  previewGauntletAction,
  seedRoundTwoAction,
  type GauntletPreview,
} from "@/lib/schedule/gauntlet-actions";
import { DIVISIONS } from "@/lib/schedule/types";

/** The rulebook's gauntlet trio: 4th, 5th and 6th of each division. */
const GAUNTLET_SEEDS = new Set([4, 5, 6]);

/** Both rounds run on one evening and the stats ingest only runs the next
 *  morning, so on the night round 1's result comes from what the captains
 *  filed. Which of the two it is matters enough to say on screen. */
const SOURCE_LABEL: Record<"fixture" | "report", string> = {
  fixture: "from fixture score",
  report: "from captain's report (not ingested yet)",
};

export default function AdminGenerateGauntlet({ season }: { season: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<GauntletPreview | null>(null);
  const [kickoff, setKickoff] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // Bumped after a write so the seeds, the existing rows and the round-2
  // offer are re-read from the server rather than guessed at locally.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void previewGauntletAction(season).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setPreview(null);
        setErr(result.error);
        return;
      }
      setErr(null);
      setPreview(result.preview);
    });
    return () => {
      cancelled = true;
    };
  }, [season, reloadToken]);

  const draw = async () => {
    if (busy || !kickoff) return;
    setErr(null);
    setDone(null);
    if (
      !confirm(
        `Draw the ${season} gauntlet from the current standings? ` +
          `Existing gauntlet fixtures for this season, including any scores, are replaced.`,
      )
    ) return;

    setBusy(true);
    // Parsed without a Z so the entered wall-clock is read in your own
    // timezone, exactly like the regular-season generator.
    const result = await drawGauntletAction(season, new Date(kickoff).toISOString());
    setBusy(false);
    if (!result.ok) {
      setErr(result.error);
      return;
    }
    setDone(`Drew ${result.count} gauntlet fixtures.`);
    setReloadToken((token) => token + 1);
    router.refresh();
  };

  const seedRoundTwo = async () => {
    if (busy || !preview?.roundTwo) return;
    setErr(null);
    setDone(null);
    const lines = preview.roundTwo.map((p) => `${p.team_a} vs ${p.team_b}`).join("\n");
    // Say it out loud when round 1 rests on reports Tuesday's ingest has not
    // confirmed: the pairing is only as right as what the captains filed.
    const caveat = preview.roundOneResults.some((status) => status.source === "report")
      ? `\n\nRound 1 is read from the captains' reports, which the stats ingest has not confirmed yet.`
      : "";
    if (!confirm(`Seed round 2 from round 1's results?\n\n${lines}${caveat}`)) return;

    setBusy(true);
    const result = await seedRoundTwoAction(season);
    setBusy(false);
    if (!result.ok) {
      setErr(result.error);
      return;
    }
    setDone(`Seeded ${result.count} round-2 fixtures.`);
    setReloadToken((token) => token + 1);
    router.refresh();
  };

  const roundOne = preview?.roundOne.filter((f) => f.stage === "gauntlet_r1") ?? [];
  const roundTwoDraft = preview?.roundOne.filter((f) => f.stage === "gauntlet_r2") ?? [];
  // Offer the seeding only while there is still a TBD opponent to fill in.
  const canSeedRoundTwo =
    Boolean(preview?.roundTwo) && (preview?.existing.r2.some((row) => !row.team_b) ?? false);

  return (
    <section className="card-brand flex flex-col gap-3 p-4">
      <div>
        <h2 className="label-dash">Generate gauntlet</h2>
        <p className="mt-1 text-xs text-muted">
          Seeds {season} from the standings: round 1 is a Bo1 between the 5th and 6th seeds across
          the divisions, round 2 a Bo3 against the 4th seeds. Both rounds run on the same day.
        </p>
      </div>

      {err && (
        <p role="alert" className="text-sm text-red-400">
          {err}
        </p>
      )}
      {done && <p className="text-sm text-success">{done}</p>}

      {preview && (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {DIVISIONS.map((division) => (
              <div key={division}>
                <p className="label-dash">{division}</p>
                <ol className="mt-1 flex flex-col gap-0.5 text-xs">
                  {preview.seeds[division].slice(0, 6).map((name, index) => (
                    <li
                      key={name}
                      className={
                        GAUNTLET_SEEDS.has(index + 1)
                          ? "font-semibold text-white"
                          : "text-muted"
                      }
                    >
                      {index + 1}. {name}
                      {GAUNTLET_SEEDS.has(index + 1) ? " · gauntlet" : ""}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>

          <div className="text-xs text-muted">
            <p className="label-dash">Round 1 (Bo1)</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {roundOne.map((fixture) => (
                <li key={`${fixture.team_a}-${fixture.team_b}`}>
                  {fixture.team_a} vs {fixture.team_b}
                </li>
              ))}
            </ul>
            <p className="label-dash mt-2">Round 2 (Bo3)</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {roundTwoDraft.map((fixture) => (
                <li key={fixture.team_a}>{fixture.team_a} vs TBD</li>
              ))}
            </ul>
          </div>

          {preview.roundOneResults.length > 0 && (
            <div className="text-xs text-muted">
              <p className="label-dash">Round 1 results on record</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {preview.roundOneResults.map((status) => (
                  <li key={status.fixtureId}>
                    {status.team_a ?? "TBD"} vs {status.team_b ?? "TBD"}
                    {status.result
                      ? ` — ${status.result.score_a}-${status.result.score_b} · ${SOURCE_LABEL[status.source ?? "fixture"]}`
                      : " — no result yet"}
                    {!status.result && status.note ? ` (${status.note})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Gauntlet kickoff
          <input
            type="datetime-local"
            required
            value={kickoff}
            onChange={(e) => setKickoff(e.target.value)}
            aria-label="Gauntlet kickoff"
            className="input-brand px-2 py-1 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={busy || !kickoff}
          onClick={() => void draw()}
          className="btn-primary px-3 py-1.5 text-xs"
        >
          {busy ? "Working…" : "Draw round 1 + round 2 placeholders"}
        </button>
        {canSeedRoundTwo && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void seedRoundTwo()}
            className="btn-primary px-3 py-1.5 text-xs"
          >
            Seed round 2 from results
          </button>
        )}
      </div>

      <p className="text-xs text-muted">
        Set the kickoff in your own time (the league plays Mondays 8pm ET); both rounds are placed
        on it. Round 2 goes in with the 4th seeds and a TBD opponent — come back once round 1 is
        reported and seed it from the results.
      </p>
    </section>
  );
}

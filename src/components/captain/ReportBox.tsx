"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { parseReport } from "@/lib/matches/parseReport";
import type { LeagueTeam } from "@/lib/matches/types";
import type { FixtureRow } from "@/lib/schedule/types";
import { purgeMatchStats, submitReport, type MyReportRow } from "@/lib/captain/queries";
import { friendlyErrorMessage } from "@/lib/captain/errors";
import { defaultFixtureId, fixtureCandidates, fixtureOptionLabel } from "@/lib/captain/reportFixture";
import MyReportsList from "./MyReportsList";

const MATCH_ID_RE = /^NA1_\d+$/;
const PHASES = ["Regular", "Playoffs"] as const;

const inputClass =
  "input-brand px-2 py-1.5 text-sm";

interface GameFormRow {
  key: string;
  gameNumber: number;
  matchId: string;
  blueTeamId: string | null;
}

interface ReportForm {
  season: string;
  phase: string;
  teamAId: string;
  teamBId: string;
  /** The schedule fixture this series is, or "" for a scrim or a makeup game
   *  with no fixture. This is what the schedule, the match page and playoff
   *  advancement all key on, so a report filed against nothing is invisible
   *  to all three. */
  fixtureId: string;
  scoreA: string;
  scoreB: string;
  draftUrl: string;
  /** "" when the series was played out; otherwise the id of the team that
   *  conceded. This is what lets the games list be shorter than the score. */
  forfeitTeamId: string;
  forfeitNote: string;
  games: GameFormRow[];
}

function makeKey(): string {
  return Math.random().toString(36).slice(2);
}

/** What the fixture's match drafter already recorded — completed games with
 *  their drafted blue side, plus the series score once winners are marked.
 *  Used only to prefill; every field stays editable. */
export interface DraftPrefill {
  draftUrl: string;
  games: { gameNumber: number; blueTeamId: string | null }[];
  scoreA: number | null;
  scoreB: number | null;
}

function emptyForm(defaults: {
  season: string;
  phase: string;
  teamAId: string | null;
  teamBId: string | null;
  fixtureId: string | null;
  draftPrefill: DraftPrefill | null;
}): ReportForm {
  const prefill = defaults.draftPrefill;
  return {
    season: defaults.season,
    phase: defaults.phase,
    teamAId: defaults.teamAId ?? "",
    teamBId: defaults.teamBId ?? "",
    fixtureId: defaults.fixtureId ?? "",
    scoreA: prefill?.scoreA != null ? String(prefill.scoreA) : "",
    scoreB: prefill?.scoreB != null ? String(prefill.scoreB) : "",
    draftUrl: prefill?.draftUrl ?? "",
    forfeitTeamId: "",
    forfeitNote: "",
    // One row per game the drafter finished: blue side filled in, the Riot
    // match id left for the captain — the one fact the drafter can't know.
    games: (prefill?.games ?? []).map((game) => ({
      key: makeKey(),
      gameNumber: game.gameNumber,
      matchId: "",
      blueTeamId: game.blueTeamId,
    })),
  };
}

/**
 * Section 3 of the captain page: the Discord-paste parser + editable form
 * (Task 3's parseReport, pre-filled from the resolved fixture), plus the
 * captain's own reports (MyReportsList, with status badges and the
 * needs-sides fixer). See docs/superpowers/specs/2026-08-11-match-reporting-
 * auto-ingest-design.md ("Reporting UI" + "Side resolution") and the
 * captains-page-design.md ("Report result" section 3).
 */
export default function ReportBox({
  teams,
  defaultSeason,
  defaultPhase,
  fixtureId,
  prefillTeamAId,
  prefillTeamBId,
  draftPrefill = null,
  myReports,
  fixtures,
  isAdmin = false,
}: {
  teams: LeagueTeam[];
  defaultSeason: string;
  defaultPhase: string;
  fixtureId: string | null;
  prefillTeamAId: string | null;
  prefillTeamBId: string | null;
  /** The fixture's completed match-draft games, if any — prefills game rows
   *  (blue sides), the draft URL, and the score from recorded winners. */
  draftPrefill?: DraftPrefill | null;
  myReports: MyReportRow[];
  /** The season's fixtures, so the report can be linked to the match it
   *  describes. Without this list the report links to `fixtureId` alone. */
  fixtures?: FixtureRow[];
  /** Whether to offer clearing the ingested stats of a game being re-filed
   *  (see purgeMatchStats). Presentation only: the RPC checks for itself. */
  isAdmin?: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();

  /** The fixtures a report about the chosen pair could be. */
  const candidatesFor = (teamAId: string, teamBId: string) =>
    fixtures
      ? fixtureCandidates(
          fixtures,
          teams.find((t) => t.id === teamAId)?.name ?? null,
          teams.find((t) => t.id === teamBId)?.name ?? null,
        )
      : [];

  /** Pick the fixture link for a form's pair — on first render, after a
   *  paste, and whenever a team changes, because a link to a match between
   *  two other teams is worse than none. Without a fixtures list there is
   *  nothing to pick from, and the page's own fixture stands. */
  const withFixtureFor = (next: ReportForm): ReportForm =>
    fixtures
      ? { ...next, fixtureId: defaultFixtureId(candidatesFor(next.teamAId, next.teamBId), next.fixtureId, fixtureId) }
      : next;
  const freshForm = () =>
    withFixtureFor(
      emptyForm({ season: defaultSeason, phase: defaultPhase, teamAId: prefillTeamAId, teamBId: prefillTeamBId, fixtureId, draftPrefill }),
    );

  const [pasteText, setPasteText] = useState("");
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [form, setForm] = useState<ReportForm>(freshForm);
  const [errors, setErrors] = useState<string[]>([]);
  /** Match ids whose stats are in raw_stats with no report behind them —
   *  what an admin is offered to clear so the games can be filed again. */
  const [purgeableIds, setPurgeableIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? "Unknown team";

  const fixtureOptions = candidatesFor(form.teamAId, form.teamBId);
  const linkedFixture = fixtureOptions.find((f) => f.id === form.fixtureId) ?? null;

  /** The drafted blue side for a game number, when the drafter recorded one. */
  const draftBlueFor = (gameNumber: number): string | null =>
    draftPrefill?.games.find((game) => game.gameNumber === gameNumber)?.blueTeamId ?? null;

  const handleParse = () => {
    const parsed = parseReport(pasteText, teams);
    setForm((prev) => withFixtureFor({
      ...prev,
      teamAId: parsed.teamAId ?? prev.teamAId,
      teamBId: parsed.teamBId ?? prev.teamBId,
      scoreA: parsed.scoreA !== null ? String(parsed.scoreA) : prev.scoreA,
      scoreB: parsed.scoreB !== null ? String(parsed.scoreB) : prev.scoreB,
      draftUrl: parsed.draftUrl ?? prev.draftUrl,
      games:
        parsed.games.length > 0
          ? parsed.games.map((g) => ({ key: makeKey(), gameNumber: g.gameNumber, matchId: g.matchId, blueTeamId: draftBlueFor(g.gameNumber) }))
          : prev.games,
    }));
    setParseWarnings(parsed.warnings);
    setErrors([]);
    setPurgeableIds([]);
    setSuccess(null);
  };

  const updateGame = (key: string, patch: Partial<GameFormRow>) => {
    setForm((prev) => ({ ...prev, games: prev.games.map((g) => (g.key === key ? { ...g, ...patch } : g)) }));
  };

  const removeGame = (key: string) => {
    setForm((prev) => ({ ...prev, games: prev.games.filter((g) => g.key !== key) }));
  };

  const addGame = () => {
    setForm((prev) => {
      const gameNumber = prev.games.length + 1;
      return {
        ...prev,
        games: [...prev.games, { key: makeKey(), gameNumber, matchId: "", blueTeamId: draftBlueFor(gameNumber) }],
      };
    });
  };

  const handleSubmit = async ({ purgeStats = false }: { purgeStats?: boolean } = {}) => {
    const problems: string[] = [];
    setPurgeableIds([]);
    if (!form.teamAId || !form.teamBId) problems.push("Pick both teams.");
    else if (form.teamAId === form.teamBId) problems.push("Teams must be different.");
    // A forfeit is the one result with no games to report: nobody played.
    // Everything else still needs at least one, because a series with no
    // games and no explanation is a report that will fail in the ingest
    // hours later with nobody watching.
    const forfeitTeamId = form.forfeitTeamId;
    if (forfeitTeamId && forfeitTeamId !== form.teamAId && forfeitTeamId !== form.teamBId) {
      problems.push("The team that forfeited must be one of the two teams in the series.");
    }
    if (form.games.length === 0 && !forfeitTeamId) {
      problems.push("Add at least one game, or record which team forfeited.");
    }

    const trimmedIds = form.games.map((g) => g.matchId.trim());
    trimmedIds.forEach((id, i) => {
      if (!MATCH_ID_RE.test(id)) {
        problems.push(`Game ${form.games[i].gameNumber}: match id must look like NA1_1234567890.`);
      }
    });
    const dupes = Array.from(new Set(trimmedIds.filter((id, i) => id && trimmedIds.indexOf(id) !== i)));
    if (dupes.length > 0) problems.push(`Duplicate match id(s) in this form: ${dupes.join(", ")}.`);

    // Which team was on blue is the one fact only someone who played the game
    // knows, and it used to be optional. A report submitted without it looks
    // fine here and then fails hours later inside the nightly ingest as
    // needs_side, where nobody is watching. Asking now costs one dropdown;
    // not asking costs a week of missing stats.
    form.games.forEach((g) => {
      if (!g.blueTeamId) problems.push(`Game ${g.gameNumber}: pick which team was on blue side.`);
    });

    const scoreA = Number(form.scoreA);
    const scoreB = Number(form.scoreB);
    const scoresValid =
      form.scoreA.trim() !== "" &&
      form.scoreB.trim() !== "" &&
      Number.isInteger(scoreA) &&
      Number.isInteger(scoreB) &&
      scoreA >= 0 &&
      scoreB >= 0;
    if (!scoresValid) problems.push("Enter a whole-number score for each team.");
    // The score still decides the series — a forfeit says why it ended, not
    // who won. Catching a backwards forfeit here beats catching it on the
    // public schedule after the ingest has already synced it.
    if (scoresValid && forfeitTeamId) {
      const forfeiterScore = forfeitTeamId === form.teamAId ? scoreA : scoreB;
      const winnerScore = forfeitTeamId === form.teamAId ? scoreB : scoreA;
      if (winnerScore <= forfeiterScore) {
        problems.push(
          `Score the series as the forfeit win — ${teamName(forfeitTeamId)} forfeited, so they cannot be the higher score.`,
        );
      }
    }

    let purged = false;
    if (problems.length === 0) {
      const [existingGames, existingStats] = await Promise.all([
        supabase.from("match_report_games").select("match_id").in("match_id", trimmedIds),
        supabase.from("raw_stats").select("match_id").in("match_id", trimmedIds),
      ]);
      const inReports = new Set(((existingGames.data ?? []) as { match_id: string }[]).map((r) => r.match_id));
      // Stats rows with no report behind them. The report that put them
      // there was deleted, but raw_stats is service-role-only, so deleting
      // it could not take them along — and while they sit there the ingester
      // skips these games and every stats page keeps the old attribution.
      // Only an admin can take them back out, through purgeMatchStats.
      const statsOnly = Array.from(
        new Set(((existingStats.data ?? []) as { match_id: string }[]).map((r) => r.match_id)),
      ).filter((id) => !inReports.has(id));

      if (inReports.size > 0) {
        problems.push(
          `Already reported: ${Array.from(inReports).join(", ")}. The existing report has to be deleted before these games can be filed again.`,
        );
      } else if (statsOnly.length > 0) {
        if (purgeStats && isAdmin) {
          try {
            await purgeMatchStats(supabase, statsOnly);
            purged = true;
          } catch (err) {
            problems.push(friendlyErrorMessage(err, "Could not clear the ingested stats."));
          }
        } else {
          problems.push(
            `Stats for ${statsOnly.join(", ")} were already ingested from an earlier report. ` +
              (isAdmin
                ? "Clear them to report these games again."
                : "Ask an admin to clear them before these games can be reported again."),
          );
          if (isAdmin) setPurgeableIds(statsOnly);
        }
      }
    }

    if (problems.length > 0) {
      setErrors(problems);
      setSuccess(null);
      return;
    }

    setSubmitting(true);
    setErrors([]);
    try {
      await submitReport(supabase, {
        season: form.season,
        phase: form.phase,
        teamAId: form.teamAId,
        teamBId: form.teamBId,
        scoreA,
        scoreB,
        draftUrl: form.draftUrl.trim() || null,
        fixtureId: form.fixtureId || null,
        forfeitTeamId: forfeitTeamId || null,
        forfeitNote: forfeitTeamId ? form.forfeitNote.trim() || null : null,
        games: form.games.map((g) => ({
          gameNumber: g.gameNumber,
          matchId: g.matchId.trim(),
          blueTeamId: g.blueTeamId,
        })),
      });
      setPasteText("");
      setParseWarnings([]);
      setForm(freshForm());
      setSuccess(
        purged
          ? "Report submitted. The earlier stats for these games were cleared; the next ingest run re-fetches them under this report."
          : "Report submitted.",
      );
      router.refresh();
    } catch (err) {
      setSuccess(null);
      setErrors([
        friendlyErrorMessage(err, "Could not submit the report."),
        // The purge is not undone by a failed insert: the stats are gone
        // either way, so say so rather than leave the admin guessing.
        ...(purged ? ["The earlier stats were cleared — submit again to file the report."] : []),
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="card-brand p-5">
      <h2 className="label-dash">Report a result</h2>

      <div className="mt-3 flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Paste your Discord report
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={4}
            placeholder={"MIC 3-0 BBC\nhttps://drafter.lol/draft/T4cB_WHp?game=1 5568297187"}
            className={`${inputClass} font-mono`}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleParse}
            disabled={!pasteText.trim()}
            className="w-fit rounded-full border border-border-subtle bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted transition hover:text-white disabled:opacity-50"
          >
            Parse paste
          </button>
          <span className="text-xs text-muted">Fills in the form below — nothing is submitted yet.</span>
        </div>
        {parseWarnings.length > 0 && (
          <ul className="flex flex-col gap-0.5 text-xs text-amber-300">
            {parseWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Season
          <input
            value={form.season}
            onChange={(e) => setForm((p) => ({ ...p, season: e.target.value }))}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Phase
          <select
            value={form.phase}
            onChange={(e) => setForm((p) => ({ ...p, phase: e.target.value }))}
            className={inputClass}
          >
            {PHASES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Team A
          <select
            value={form.teamAId}
            onChange={(e) => setForm((p) => withFixtureFor({ ...p, teamAId: e.target.value }))}
            className={inputClass}
          >
            <option value="">Select…</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Team B
          <select
            value={form.teamBId}
            onChange={(e) => setForm((p) => withFixtureFor({ ...p, teamBId: e.target.value }))}
            className={inputClass}
          >
            <option value="">Select…</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Score A
          <input
            inputMode="numeric"
            value={form.scoreA}
            onChange={(e) => setForm((p) => ({ ...p, scoreA: e.target.value }))}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Score B
          <input
            inputMode="numeric"
            value={form.scoreB}
            onChange={(e) => setForm((p) => ({ ...p, scoreB: e.target.value }))}
            className={inputClass}
          />
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
          Forfeit (optional)
          <select
            value={form.forfeitTeamId}
            onChange={(e) => setForm((p) => ({ ...p, forfeitTeamId: e.target.value }))}
            className={inputClass}
          >
            <option value="">Series was played out</option>
            {form.teamAId && <option value={form.teamAId}>{teamName(form.teamAId)} forfeited</option>}
            {form.teamBId && <option value={form.teamBId}>{teamName(form.teamBId)} forfeited</option>}
          </select>
        </label>
        {form.forfeitTeamId && (
          <>
            <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
              Why (optional)
              <input
                value={form.forfeitNote}
                onChange={(e) => setForm((p) => ({ ...p, forfeitNote: e.target.value }))}
                placeholder="No show, roster ineligible, conceded after game 1…"
                className={inputClass}
              />
            </label>
            {/* The one thing a captain in this situation actually needs told:
                report the games that happened and nothing else. The instinct
                is to leave the whole series out, or to invent rows for the
                games nobody played — and the first loses real stats while the
                second poisons them. */}
            <p className="col-span-2 text-xs text-prestige">
              Score the series as the forfeit win, then add only the games that were actually
              played — leave the rest out. Those games still count in full for player stats and
              cards. If nobody played at all, add no games.
            </p>
          </>
        )}
        <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
          Draft URL (optional)
          <input
            value={form.draftUrl}
            onChange={(e) => setForm((p) => ({ ...p, draftUrl: e.target.value }))}
            placeholder="https://drafter.lol/draft/…"
            className={inputClass}
          />
        </label>
        {fixtureOptions.length > 0 && (
          <label className="col-span-2 flex flex-col gap-1 text-xs text-muted sm:col-span-4">
            Fixture
            <select
              value={form.fixtureId}
              onChange={(e) => setForm((p) => ({ ...p, fixtureId: e.target.value }))}
              className={inputClass}
            >
              <option value="">No fixture — scrim or unscheduled game</option>
              {fixtureOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {fixtureOptionLabel(f)}
                </option>
              ))}
            </select>
            {/* Said here because it is the one place it can be: a report
                filed against no fixture never reaches the schedule, the
                match page, or the playoff bracket, and nothing downstream
                says why. */}
            {linkedFixture && linkedFixture.score_a !== null ? (
              <span className="text-prestige">
                This fixture already has a score. Reporting it again is how a corrected series gets its games
                back on the match page and its winner through the bracket; the score itself is edited on the
                schedule.
              </span>
            ) : (
              <span>The schedule, the match page and playoff advancement all read the report through this link.</span>
            )}
          </label>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Games</p>
        {draftPrefill && (
          <p className="text-xs text-muted">
            Blue sides{draftPrefill.scoreA != null ? ", score," : ""} and the draft link are pre-filled from your match
            drafter — double-check them, then add each game&apos;s Riot match id.
          </p>
        )}
        {form.games.length === 0 && (
          <p className="text-sm text-muted">
            {form.forfeitTeamId
              ? "No games — reporting this as a forfeit with nothing played."
              : "No games yet — parse a paste or add one."}
          </p>
        )}
        {form.games.map((g) => (
          <div key={g.key} className="flex flex-wrap items-center gap-2">
            <span className="w-16 shrink-0 text-xs text-muted">Game {g.gameNumber}</span>
            <input
              value={g.matchId}
              onChange={(e) => updateGame(g.key, { matchId: e.target.value })}
              placeholder="NA1_1234567890"
              className={`${inputClass} min-w-0 flex-1 font-mono`}
            />
            <select
              value={g.blueTeamId ?? ""}
              onChange={(e) => updateGame(g.key, { blueTeamId: e.target.value || null })}
              className={inputClass}
            >
              <option value="">Blue side?</option>
              {form.teamAId && <option value={form.teamAId}>{teamName(form.teamAId)} blue</option>}
              {form.teamBId && <option value={form.teamBId}>{teamName(form.teamBId)} blue</option>}
            </select>
            <button
              type="button"
              onClick={() => removeGame(g.key)}
              className="shrink-0 text-xs font-semibold text-muted hover:text-red-400"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addGame}
          className="w-fit rounded-full border border-border-subtle bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted transition hover:text-white"
        >
          + Add game
        </button>
      </div>

      {errors.length > 0 && (
        <ul role="alert" className="mt-3 flex flex-col gap-1 text-sm text-red-400">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {isAdmin && purgeableIds.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSubmit({ purgeStats: true })}
            disabled={submitting}
            className="rounded-full border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-red-400 disabled:opacity-50"
          >
            Clear ingested stats and submit
          </button>
          <span className="text-xs text-muted">
            Deletes the stats rows for {purgeableIds.length === 1 ? "that game" : "those games"} and files this
            report; the next ingest run re-fetches them from Riot. Cards and editions already built from the old
            rows keep their numbers until rebuilt.
          </span>
        </div>
      )}
      {success && <p className="mt-3 text-sm font-semibold text-success">{success}</p>}

      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={submitting}
        className="mt-4 rounded-full bg-action-fill px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit report"}
      </button>

      <MyReportsList teams={teams} myReports={myReports} />
    </section>
  );
}

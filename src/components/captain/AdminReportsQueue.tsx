"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { LeagueTeam, MatchReport, MatchReportGame } from "@/lib/matches/types";
import type { FixtureRow } from "@/lib/schedule/types";
import { fixGameSide, purgeMatchStats } from "@/lib/captain/queries";
import { friendlyErrorMessage } from "@/lib/captain/errors";
import { fixtureCandidates, fixtureOptionLabel } from "@/lib/captain/reportFixture";
import { FixtureChips, ForfeitLine, StatusBadge } from "./reportStatus";

/**
 * Admin panel on /captain: every match_reports row (any team, any season),
 * newest first, with status badges, error_text/warning_text, per-game rows,
 * Retry, Delete, and the needs-sides fixer. See task-6-brief.md
 * ("AdminReportsQueue") — same needs-sides interaction as
 * src/components/captain/MyReportsList.tsx's "My reports", extended with
 * the two admin-only actions.
 */
export default function AdminReportsQueue({
  reports,
  games,
  teams,
  fixtures,
  initiallyOpen = false,
}: {
  reports: MatchReport[];
  games: MatchReportGame[];
  teams: LeagueTeam[];
  /** The season's fixtures. With them, a report filed against no fixture
   *  gets a picker to link it after the fact; without, no picker. */
  fixtures?: FixtureRow[];
  initiallyOpen?: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(initiallyOpen);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? "Unknown team";
  const teamAbbr = (id: string) => teams.find((t) => t.id === id)?.abbreviation ?? "—";
  const gamesFor = (reportId: string) =>
    games.filter((g) => g.report_id === reportId).sort((a, b) => a.game_number - b.game_number);

  /**
   * Report -> status 'pending', clear error_text; every non-ingested game
   * (pending, needs_side, or failed) also goes back to 'pending' with its
   * own error_text cleared, so the retried queue doesn't show a "pending"
   * game sitting next to a stale failure message from the attempt being
   * retried. Ingested games are left untouched. See task-6-brief.md's Retry
   * description.
   */
  const handleRetry = async (report: MatchReport) => {
    setBusyId(report.id);
    setError(null);
    const { error: reportError } = await supabase
      .from("match_reports")
      .update({ status: "pending", error_text: null })
      .eq("id", report.id);
    if (reportError) {
      setBusyId(null);
      setError(reportError.message);
      return;
    }
    const { error: gamesError } = await supabase
      .from("match_report_games")
      .update({ status: "pending", error_text: null })
      .eq("report_id", report.id)
      .neq("status", "ingested");
    setBusyId(null);
    if (gamesError) {
      setError(gamesError.message);
      return;
    }
    router.refresh();
  };

  /**
   * A deleted report takes its ingested stats with it. The raw_stats rows
   * the ingester wrote carry this report's team names and phase; left
   * behind, they keep that attribution on every stats page with no report
   * to point at, and block the games from ever being reported again (the
   * form refuses the match ids, the ingester skips them). raw_stats is the
   * one record a captain cannot write, so it is asked directly rather than
   * trusting each game's client-writable status.
   */
  const handleDelete = async (report: MatchReport) => {
    const label = `${teamAbbr(report.team_a_id)} ${report.score_a}–${report.score_b} ${teamAbbr(report.team_b_id)}`;
    const matchIds = gamesFor(report.id).map((g) => g.match_id);
    setBusyId(report.id);
    setError(null);

    let ingestedIds: string[] = [];
    if (matchIds.length > 0) {
      const { data, error: statsError } = await supabase
        .from("raw_stats")
        .select("match_id")
        .in("match_id", matchIds);
      if (statsError) {
        setBusyId(null);
        setError(statsError.message);
        return;
      }
      ingestedIds = Array.from(new Set(((data ?? []) as { match_id: string }[]).map((r) => r.match_id)));
    }

    const stats =
      ingestedIds.length === 0
        ? ""
        : ` and the ingested stats for ${ingestedIds.length === 1 ? "its game" : `${ingestedIds.length} of its games`}, so the series can be reported again — run the ingest after re-reporting. Cards and editions already built from those stats keep their numbers until rebuilt.`;
    if (!confirm(`Delete the ${label} report? This also deletes its games${stats || "."}`)) {
      setBusyId(null);
      return;
    }

    const { error: deleteError } = await supabase.from("match_reports").delete().eq("id", report.id);
    if (deleteError) {
      setBusyId(null);
      setError(deleteError.message);
      return;
    }
    // Report first, stats second: if this step fails the report is still
    // gone (the admin's actual intent) and the leftover rows can be cleared
    // from the reporting form when the games are re-filed.
    if (ingestedIds.length > 0) {
      try {
        await purgeMatchStats(supabase, ingestedIds);
      } catch (err) {
        setBusyId(null);
        setError(
          `Report deleted, but its ingested stats could not be cleared: ${friendlyErrorMessage(
            err,
            "unknown error",
          )}. Re-report the games and use "Clear ingested stats and submit".`,
        );
        router.refresh();
        return;
      }
    }
    setBusyId(null);
    router.refresh();
  };

  /**
   * A report with no fixture_id is invisible to the schedule, the match page
   * and playoff advancement, however cleanly it ingested. Linking it here is
   * the repair; the ingest does not have to run again for it, because the
   * link is all those three read. The fixture score is not touched: a
   * report only ever fills an empty one, and this one is already past that.
   */
  const handleLinkFixture = async (report: MatchReport, fixtureId: string) => {
    setBusyId(report.id);
    setError(null);
    const { data, error: linkError } = await supabase
      .from("match_reports")
      .update({ fixture_id: fixtureId })
      .eq("id", report.id)
      .is("fixture_id", null)
      .select("id");
    setBusyId(null);
    if (linkError) {
      setError(linkError.message);
      return;
    }
    if (!data || data.length === 0) {
      setError("This report was linked to a fixture by someone else in the meantime — refresh to see it.");
      return;
    }
    router.refresh();
  };

  const handleFixSide = async (gameId: string, blueTeamId: string) => {
    setBusyId(gameId);
    setError(null);
    const result = await fixGameSide(supabase, gameId, blueTeamId);
    setBusyId(null);
    if (!result.ok) {
      setError(result.error?.message ?? "Could not update this game.");
      return;
    }
    router.refresh();
  };

  return (
    <div className="card-brand overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="label-dash">Admin — all reports ({reports.length})</span>
        <span aria-hidden="true" className="text-muted">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-border-subtle px-4 py-4">
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          {reports.length === 0 ? (
            <p className="text-sm text-muted">No reports submitted yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {reports.map((r) => {
                const busy = busyId === r.id;
                return (
                  <li key={r.id} className="rounded border border-border-subtle/60 bg-canvas/60 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-white">
                        {teamAbbr(r.team_a_id)} {r.score_a}–{r.score_b} {teamAbbr(r.team_b_id)}
                      </span>
                      <StatusBadge status={r.status} />
                      <FixtureChips fixtureId={r.fixture_id} status={r.status} />
                      <span className="text-xs text-muted">
                        {r.season_phase} · {r.season}
                      </span>
                      <div className="ml-auto flex gap-1.5">
                        <button
                          type="button"
                          disabled={busy || r.status === "ingested" || r.status === "forfeit"}
                          onClick={() => void handleRetry(r)}
                          title={
                            r.status === "ingested"
                              ? "Already ingested — nothing to retry"
                              : r.status === "forfeit"
                                ? "Settled by forfeit — there are no games to re-ingest"
                                : undefined
                          }
                          className="rounded-full border border-border-subtle bg-surface px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-muted transition hover:text-white disabled:opacity-50"
                        >
                          Retry
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDelete(r)}
                          className="rounded-full border border-red-400/40 bg-red-500/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-red-400 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {(() => {
                      if (r.fixture_id || !fixtures) return null;
                      const options = fixtureCandidates(fixtures, teamName(r.team_a_id), teamName(r.team_b_id));
                      return (
                        <label className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-amber-300">
                          Not linked to a fixture — the schedule and bracket cannot see it.
                          {options.length > 0 ? (
                            <select
                              disabled={busy}
                              defaultValue=""
                              onChange={(e) => {
                                if (e.target.value) void handleLinkFixture(r, e.target.value);
                              }}
                              className="rounded border border-border-subtle bg-canvas px-1.5 py-0.5 text-xs text-white"
                            >
                              <option value="" disabled>
                                Link to fixture…
                              </option>
                              {options.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {fixtureOptionLabel(f)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-muted">No fixture between these teams this season.</span>
                          )}
                        </label>
                      );
                    })()}
                    <ForfeitLine team={r.forfeit_team_id ? teamName(r.forfeit_team_id) : null} note={r.forfeit_note} />
                    {r.error_text && <p className="mt-1 text-xs text-red-400">{r.error_text}</p>}
                    {r.warning_text && <p className="mt-1 text-xs text-amber-300">{r.warning_text}</p>}
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {gamesFor(r.id).map((g) => (
                        <li key={g.id} className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="w-16 shrink-0 text-muted">Game {g.game_number}</span>
                          <code className="text-muted">{g.match_id}</code>
                          <StatusBadge status={g.status} />
                          {g.error_text && <span className="text-red-400">{g.error_text}</span>}
                          {g.status === "needs_side" && (
                            <select
                              disabled={busyId === g.id}
                              defaultValue=""
                              onChange={(e) => {
                                if (e.target.value) void handleFixSide(g.id, e.target.value);
                              }}
                              className="rounded border border-border-subtle bg-canvas px-1.5 py-0.5 text-xs text-white"
                            >
                              <option value="" disabled>
                                Which side was blue?
                              </option>
                              <option value={r.team_a_id}>{teamName(r.team_a_id)}</option>
                              <option value={r.team_b_id}>{teamName(r.team_b_id)}</option>
                            </select>
                          )}
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

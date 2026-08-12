"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { LeagueTeam, MatchReport, MatchReportGame } from "@/lib/matches/types";

const STATUS_STYLES: Record<string, string> = {
  pending: "border-steel/50 text-steel",
  ingested: "border-gold/50 text-gold",
  needs_sides: "border-amber-400/60 text-amber-300",
  needs_side: "border-amber-400/60 text-amber-300",
  failed: "border-red-400/60 text-red-400",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${
        STATUS_STYLES[status] ?? "border-line text-steel"
      }`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

/**
 * A report's link to `/schedule`'s `fixtures` table (Task 8): a steel
 * "Schedule" chip whenever the report is attached to a fixture, plus a
 * gold "Synced" chip once that fixture's score has (or will have, on the
 * next ingest pass) been auto-filled from this report — i.e. the report
 * has reached `ingested`. The fixture's own score is the source of truth
 * on /schedule; this is just an indicator, no extra fetch needed here.
 */
function FixtureChips({ fixtureId, status }: { fixtureId: string | null; status: string }) {
  if (!fixtureId) return null;
  return (
    <>
      <span className="rounded-full border border-steel/50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-steel">
        Schedule
      </span>
      {status === "ingested" && (
        <span className="rounded-full border border-gold/50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-gold">
          Synced
        </span>
      )}
    </>
  );
}

/**
 * Admin panel on /captain: every match_reports row (any team, any season),
 * newest first, with status badges, error_text/warning_text, per-game rows,
 * Retry, Delete, and the needs-sides fixer. See task-6-brief.md
 * ("AdminReportsQueue") — same needs-sides interaction as
 * src/components/captain/ReportBox.tsx's "My reports", extended with the
 * two admin-only actions.
 */
export default function AdminReportsQueue({
  reports,
  games,
  teams,
}: {
  reports: MatchReport[];
  games: MatchReportGame[];
  teams: LeagueTeam[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
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

  const handleDelete = async (report: MatchReport) => {
    if (
      !confirm(
        `Delete the ${teamAbbr(report.team_a_id)} ${report.score_a}–${report.score_b} ${teamAbbr(
          report.team_b_id
        )} report? This also deletes its games.`
      )
    ) {
      return;
    }
    setBusyId(report.id);
    setError(null);
    const { error: deleteError } = await supabase.from("match_reports").delete().eq("id", report.id);
    setBusyId(null);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    router.refresh();
  };

  const handleFixSide = async (gameId: string, blueTeamId: string) => {
    setBusyId(gameId);
    setError(null);
    const { data, error: fixError } = await supabase
      .from("match_report_games")
      .update({ blue_team_id: blueTeamId, status: "pending" })
      .eq("id", gameId)
      .select();
    setBusyId(null);
    if (fixError) {
      setError(fixError.message);
      return;
    }
    // An RLS denial on UPDATE isn't an error -- the row just doesn't match
    // the policy's USING clause (e.g. the report was ingested in the
    // interim), so PostgREST reports success with zero rows affected.
    // Without `.select()` above that would silently look like it worked
    // until refresh. Treat "we asked for the row back and got none" as a
    // denial and surface a friendly message instead of a silent no-op.
    if (!data || data.length === 0) {
      setError("Could not update this game.");
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
        <span aria-hidden="true" className="text-steel">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-line px-4 py-4">
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          {reports.length === 0 ? (
            <p className="text-sm text-steel">No reports submitted yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {reports.map((r) => {
                const busy = busyId === r.id;
                return (
                  <li key={r.id} className="rounded border border-line/60 bg-navy/60 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-white">
                        {teamAbbr(r.team_a_id)} {r.score_a}–{r.score_b} {teamAbbr(r.team_b_id)}
                      </span>
                      <StatusBadge status={r.status} />
                      <FixtureChips fixtureId={r.fixture_id} status={r.status} />
                      <span className="text-xs text-steel">
                        {r.season_phase} · {r.season}
                      </span>
                      <div className="ml-auto flex gap-1.5">
                        <button
                          type="button"
                          disabled={busy || r.status === "ingested"}
                          onClick={() => void handleRetry(r)}
                          title={r.status === "ingested" ? "Already ingested — nothing to retry" : undefined}
                          className="rounded-full border border-line bg-panel px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-steel transition hover:text-white disabled:opacity-50"
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
                    {r.error_text && <p className="mt-1 text-xs text-red-400">{r.error_text}</p>}
                    {r.warning_text && <p className="mt-1 text-xs text-amber-300">{r.warning_text}</p>}
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {gamesFor(r.id).map((g) => (
                        <li key={g.id} className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="w-16 shrink-0 text-steel">Game {g.game_number}</span>
                          <code className="text-steel">{g.match_id}</code>
                          <StatusBadge status={g.status} />
                          {g.error_text && <span className="text-red-400">{g.error_text}</span>}
                          {g.status === "needs_side" && (
                            <select
                              disabled={busyId === g.id}
                              defaultValue=""
                              onChange={(e) => {
                                if (e.target.value) void handleFixSide(g.id, e.target.value);
                              }}
                              className="rounded border border-line bg-navy px-1.5 py-0.5 text-xs text-white"
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

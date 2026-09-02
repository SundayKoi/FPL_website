"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { LeagueTeam } from "@/lib/matches/types";
import { fixGameSide, type MyReportRow } from "@/lib/captain/queries";
import { friendlyErrorMessage } from "@/lib/captain/errors";
import { FixtureChips, ForfeitLine, StatusBadge } from "./reportStatus";

/**
 * The "My reports" half of the report section: the captain's own reports
 * with status badges and the needs-side fixer. Same needs-side interaction
 * as AdminReportsQueue, minus that panel's admin-only Retry/Delete actions.
 */
export default function MyReportsList({
  teams,
  myReports,
}: {
  teams: LeagueTeam[];
  myReports: MyReportRow[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [fixerBusy, setFixerBusy] = useState<string | null>(null);
  const [fixerError, setFixerError] = useState<string | null>(null);

  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? "Unknown team";
  const teamAbbr = (id: string | null) => teams.find((t) => t.id === id)?.abbreviation ?? "—";

  const handleFixSide = async (gameId: string, blueTeamId: string) => {
    setFixerBusy(gameId);
    setFixerError(null);
    const result = await fixGameSide(supabase, gameId, blueTeamId);
    setFixerBusy(null);
    if (!result.ok) {
      setFixerError(
        result.error
          ? friendlyErrorMessage(result.error, "Could not update this game.")
          : "Could not update this game."
      );
      return;
    }
    router.refresh();
  };

  return (
    <div className="mt-6 border-t border-border pt-4">
      <h3 className="label-dash">My reports</h3>
      {fixerError && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {fixerError}
        </p>
      )}
      {myReports.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No reports submitted yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {myReports.map((r) => (
            <li key={r.id} className="rounded border border-border/60 bg-canvas/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-white">
                  {teamAbbr(r.team_a_id)} {r.score_a}–{r.score_b} {teamAbbr(r.team_b_id)}
                </span>
                <StatusBadge status={r.status} />
                <FixtureChips fixtureId={r.fixture_id} status={r.status} />
                <span className="text-xs text-muted">
                  {r.season_phase} · {r.season}
                </span>
              </div>
              <ForfeitLine team={r.forfeit_team_id ? teamAbbr(r.forfeit_team_id) : null} note={r.forfeit_note} />
              {r.error_text && <p className="mt-1 text-xs text-red-400">{r.error_text}</p>}
              {r.warning_text && <p className="mt-1 text-xs text-amber-300">{r.warning_text}</p>}
              <ul className="mt-2 flex flex-col gap-1.5">
                {r.games.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="w-16 shrink-0 text-muted">Game {g.game_number}</span>
                    <code className="text-muted">{g.match_id}</code>
                    <StatusBadge status={g.status} />
                    {g.status === "needs_side" && (
                      <select
                        disabled={fixerBusy === g.id}
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) void handleFixSide(g.id, e.target.value);
                        }}
                        className="rounded border border-border bg-canvas px-1.5 py-0.5 text-xs text-white"
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
          ))}
        </ul>
      )}
    </div>
  );
}

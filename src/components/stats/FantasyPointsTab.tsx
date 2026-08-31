"use client";

// Fantasy points, per player: a week at a time or the whole season.
//
// This is the league's own tariff — three a kill, minus one a death, and
// so on — applied to every game a player has played. It is NOT the Fantasy
// mode's lineup score (src/lib/fantasy/scoring.ts), which ranks a lineup
// by Power Ranking against that week's cohort. The two answer different
// questions and are labelled apart everywhere they appear, because a
// player finishing first here and fourth there is correct, not a bug.
//
// Scored on the client from raw rows rather than by a view: the tariff is
// one pure function (lib/stats/fantasyPoints.ts) and the same rows answer
// both the weekly and the season table, so there is no way for the two to
// disagree about a game.

import { useCallback, useMemo, useState } from "react";
import { fetchFantasyRows } from "@/lib/stats/queries";
import { FANTASY_TARIFF, fantasySeason, fantasyWeek, weeksIn } from "@/lib/stats/fantasyPoints";
import { editionLabel } from "@/lib/packs/week";
import type { PhaseFilter } from "./SeasonSelect";
import { ALL_SEASONS } from "./SeasonSelect";
import { EmptyCard, ErrorCard, FilterPill, LoadingCard } from "./statsUi";
import { useStatsFetch } from "./useStatsFetch";

/** The tariff, as a line of chips — the table is meaningless without it,
 *  and a player asking "why am I ninth" deserves the answer on the page
 *  rather than in a pinned message. */
const TARIFF_CHIPS: { label: string; value: string }[] = [
  { label: "Kill", value: `${FANTASY_TARIFF.kill}` },
  { label: "Death", value: `${FANTASY_TARIFF.death}` },
  { label: "Assist", value: `${FANTASY_TARIFF.assist}` },
  { label: "CS/min", value: `${FANTASY_TARIFF.csPerMin}` },
  { label: "Vision", value: `${FANTASY_TARIFF.visionScore}` },
  { label: "DMG share", value: `${FANTASY_TARIFF.damageShare} / 100%` },
  { label: "KP", value: `${FANTASY_TARIFF.killParticipation} / 100%` },
  { label: "Win", value: `+${FANTASY_TARIFF.win}` },
];

const SEASON_VIEW = "season";

export default function FantasyPointsTab({ season, phase }: { season: string; phase: PhaseFilter }) {
  const loadRows = useCallback(() => {
    const seasonParam = season === ALL_SEASONS ? undefined : season;
    const phaseParam = phase === "All" ? undefined : phase;
    return fetchFantasyRows(seasonParam, phaseParam);
  }, [season, phase]);
  const { data, status } = useStatsFetch(loadRows, `${season}::${phase}`);
  const rows = useMemo(() => data ?? [], [data]);

  const players = useMemo(() => fantasySeason(rows), [rows]);
  const weeks = useMemo(() => weeksIn(rows), [rows]);
  /** Which week is on screen, or the whole season. Defaults to the season:
   *  "who is winning" is the question the tab is opened with. */
  const [view, setView] = useState<string>(SEASON_VIEW);
  // A season change can retire the week that was selected. Falling back in
  // render beats an effect that briefly shows an empty table.
  const active = view !== SEASON_VIEW && !weeks.includes(view) ? SEASON_VIEW : view;

  /** One shape for both views, because the columns differ in MEANING
   *  rather than in kind: a week's Pts is the mean of its games, and the
   *  season's is the sum of those weekly means. */
  const shown = useMemo(() => {
    if (active === SEASON_VIEW) {
      return players.map((player) => ({
        key: player.key,
        name: player.summonerName,
        tag: player.tag,
        weeks: player.weeks.length,
        games: player.games,
        wins: player.wins,
        points: player.points,
        secondary: player.perWeek,
      }));
    }
    return fantasyWeek(players, active).map((player) => ({
      key: player.key,
      name: player.summonerName,
      tag: player.tag,
      weeks: 1,
      games: player.weekScore.games,
      wins: player.weekScore.wins,
      points: player.weekScore.points,
      secondary: null,
    }));
  }, [players, active]);

  const seasonView = active === SEASON_VIEW;

  if (status === "loading") return <LoadingCard label="fantasy points" />;
  if (status === "error") return <ErrorCard noun="fantasy points" />;
  if (players.length === 0) {
    return <EmptyCard message="No games have been played in this scope yet." />;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="card-brand flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-steel">Point values</span>
        {TARIFF_CHIPS.map((chip) => (
          <span key={chip.label} className="text-xs text-steel">
            {chip.label} <b className="text-white">{chip.value}</b>
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterPill active={active === SEASON_VIEW} onClick={() => setView(SEASON_VIEW)} uppercase>
          Season total
        </FilterPill>
        {weeks.map((week) => (
          <FilterPill key={week} active={active === week} onClick={() => setView(week)} uppercase>
            {editionLabel(week)}
          </FilterPill>
        ))}
      </div>

      <div className="card-brand overflow-x-auto p-0">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-cyan/20">
              {["#", "Player", ...(seasonView ? ["WKS"] : []), "GP", "W", "Pts", ...(seasonView ? ["Pts/wk"] : [])].map(
                (label, index) => (
                  <th
                    key={label}
                    title={label === "Pts" ? (seasonView ? "Sum of the weekly scores" : "Average of this week's games") : undefined}
                    className={`px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-steel ${
                      index < 2 ? "text-left" : "text-right"
                    } ${index === 1 ? "sticky left-0 z-10 bg-panel" : ""}`}
                  >
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {shown.map((player, index) => (
              <tr key={player.key} className="border-b border-line/60 last:border-0">
                <td className="px-3 py-2 font-mono text-xs text-steel">{index + 1}</td>
                <td className="sticky left-0 z-10 bg-panel px-3 py-2 font-semibold text-white">
                  {player.name}
                  <span className="ml-1 text-xs font-normal text-steel">#{player.tag}</span>
                </td>
                {seasonView ? (
                  <td className="px-3 py-2 text-right tabular-nums text-steel">{player.weeks}</td>
                ) : null}
                <td className="px-3 py-2 text-right tabular-nums text-steel">{player.games}</td>
                <td className="px-3 py-2 text-right tabular-nums text-steel">{player.wins}</td>
                <td className="px-3 py-2 text-right font-bold tabular-nums text-cyan">{player.points}</td>
                {/* The fair comparison over a season: people miss different
                    weeks, and a missed week is a zero nobody chose. */}
                {seasonView ? (
                  <td className="px-3 py-2 text-right tabular-nums text-steel">{player.secondary}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-steel">
        A week scores the <b className="text-white">average</b> of the games played in it, so four games and two
        games are both one week. The season total is the <b className="text-white">sum of those weekly scores</b>
        {" "}— turning up for another week earns another score.
      </p>
      <p className="text-xs text-steel">
        Separate from the Fantasy card game&rsquo;s lineup scoring, which ranks a lineup by Power Ranking against
        the week&rsquo;s field. This table is the flat tariff above, applied to every game played.
      </p>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import StatsTable from "@/components/offseason/StatsTable";
import { Empty, OffseasonShell, Panel } from "@/components/offseason/ui";
import { loadOffseasonPage } from "@/lib/offseason/page";
import { bestGames, LEADER_LABELS, leaders, playerStats, type GameHighlight, type LeaderStat, type PlayerStats } from "@/lib/offseason/stats";
import { firstParam, type SearchParamValue } from "@/lib/searchParams";

export const metadata: Metadata = {
  title: "Offseason Stats — FPL",
  description: "Every offseason player's numbers, the category leaders and the best games.",
};

const pill = (active: boolean) =>
  active
    ? "rounded-full border border-action-text bg-action-fill/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white"
    : "rounded-full border border-border-subtle px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted hover:text-white";

function leaderValue(player: PlayerStats, stat: LeaderStat): string {
  const value = player.line[stat];
  if (value === null) return "—";
  return stat === "damagePerMin" ? Math.round(value).toLocaleString("en-US") : stat === "kda" || stat === "visionPerMin" ? value.toFixed(2) : value.toFixed(1);
}

function Highlights({ title, games }: { title: string; games: GameHighlight[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">{title}</p>
      <ol className="flex flex-col gap-1.5">
        {games.map((game, index) => (
          <li key={`${game.entrantId}-${index}`} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
            <span>
              <Link href={`/offseason/players/${game.entrantId}`} className="font-semibold text-white hover:text-action-text">
                {game.name}
              </Link>{" "}
              <span className="text-muted">
                {game.champion ?? "?"}
                {game.weekNumber ? ` · week ${game.weekNumber}` : ""}
                {game.playedBy ? ` · sub: ${game.playedBy}` : ""}
              </span>
            </span>
            <span className="tabular-nums text-content">
              {game.kills} / {game.deaths} / {game.assists}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default async function OffseasonStatsPage({ searchParams }: { searchParams: Promise<Record<string, SearchParamValue>> }) {
  const [{ view, isStaff }, params] = await Promise.all([loadOffseasonPage(), searchParams]);

  if (!view) {
    return (
      <OffseasonShell title="Stats" active="stats" isStaff={isStaff}>
        <Panel title="Stats">
          <Empty>The offseason tournament has not been set up yet.</Empty>
        </Panel>
      </OffseasonShell>
    );
  }

  const requested = Number(firstParam(params.week));
  const weekNumber = view.weeks.some((week) => week.week_number === requested) ? requested : null;
  const players = playerStats(view, weekNumber);
  const boards = leaders(players, weekNumber === null ? 2 : 1);
  const best = bestGames(view, weekNumber);
  const scope = weekNumber === null ? "the event" : `week ${weekNumber}`;

  return (
    <OffseasonShell
      eyebrow={view.event.name}
      title="Stats"
      active="stats"
      isStaff={isStaff}
      description="Every player's numbers from their ingested games, per game and per minute. A sub's games count for the player they replaced."
    >
      <nav aria-label="Weeks" className="flex flex-wrap gap-2">
        <Link href="/offseason/stats" aria-current={weekNumber === null ? "page" : undefined} className={pill(weekNumber === null)}>
          Whole event
        </Link>
        {view.weeks.map((week) => (
          <Link
            key={week.id}
            href={`/offseason/stats?week=${week.week_number}`}
            aria-current={weekNumber === week.week_number ? "page" : undefined}
            className={pill(weekNumber === week.week_number)}
          >
            Week {week.week_number}
          </Link>
        ))}
      </nav>

      {players.length === 0 ? (
        <Panel title="Players">
          <Empty>No games from {scope} have been ingested yet. Stats appear here once they are.</Empty>
        </Panel>
      ) : (
        <>
          <Panel title="Leaders" aside={weekNumber === null ? "Two games or more" : undefined}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(Object.keys(LEADER_LABELS) as LeaderStat[]).map((stat) => (
                <div key={stat} className="flex flex-col gap-2 rounded-md border border-border-subtle bg-canvas/60 p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted">{LEADER_LABELS[stat]}</p>
                  <ol className="flex flex-col gap-1">
                    {boards[stat].map((player, index) => (
                      <li key={player.entrantId} className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate">
                          <span className="mr-1.5 tabular-nums text-muted">{index + 1}</span>
                          <Link
                            href={`/offseason/players/${player.entrantId}`}
                            className={index === 0 ? "font-semibold text-gold hover:underline" : "text-content hover:text-action-text"}
                          >
                            {player.name}
                          </Link>
                        </span>
                        <span className="shrink-0 tabular-nums text-white">{leaderValue(player, stat)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Players" aside={`${players.length} with games in ${scope}`}>
            <StatsTable players={players} showTeam={weekNumber !== null} />
          </Panel>

          <Panel title="Best games">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Highlights title="Most kills" games={best.kills} />
              <Highlights title="Best KDA" games={best.kda} />
            </div>
          </Panel>
        </>
      )}
    </OffseasonShell>
  );
}

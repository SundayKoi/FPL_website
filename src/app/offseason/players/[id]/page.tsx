import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Empty, OffseasonShell, Overall, Panel, RoleTag, safeLink, tableClass, tdClass, thClass } from "@/components/offseason/ui";
import { matchScore } from "@/components/offseason/WeekBoard";
import { cardPlayerKey } from "@/lib/cards/cardKeys";
import { ROLE_LABELS } from "@/lib/draft/types";
import { loadOffseasonPage } from "@/lib/offseason/page";
import { entrantKey } from "@/lib/offseason/ratings";
import { STAGE_LABELS } from "@/lib/offseason/types";

export const metadata: Metadata = {
  title: "Offseason Player — FPL",
};

const STATUS_TEXT = {
  active: "Active",
  benched: "Sitting out",
  eliminated: "Eliminated",
  withdrawn: "Withdrawn",
} as const;

export default async function OffseasonPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { view, isStaff } = await loadOffseasonPage();
  const entrant = view?.entrantsById.get(id);
  if (!view || !entrant) notFound();

  const rating = view.ratings.get(entrant.id);
  const opgg = safeLink(entrant.opgg_url);
  const card = rating?.card ?? null;
  const key = entrantKey(entrant.riot_id);
  const games = key
    ? view.stats
        .filter((row) => cardPlayerKey(row.summoner_name, row.tag) === key)
        .sort((a, b) => (b.game_date ?? "").localeCompare(a.game_date ?? ""))
    : [];

  const memberships = view.members
    .filter((member) => member.entrant_id === entrant.id)
    .map((member) => {
      const team = view.teamsById.get(member.team_id)!;
      return { member, team, week: view.weekById.get(team.week_id)! };
    })
    .sort((a, b) => b.week.week_number - a.week.week_number);

  return (
    <OffseasonShell
      eyebrow={view.event.name}
      title={entrant.display_name}
      isStaff={isStaff}
      description={
        <span className="flex flex-wrap items-center gap-2">
          <RoleTag role={entrant.assigned_role ?? entrant.primary_role} />
          <span>{entrant.riot_id}</span>
          {entrant.current_rank ? <span>· {entrant.current_rank}</span> : null}
          <span>
            · {STATUS_TEXT[entrant.status]}
            {entrant.status === "eliminated" ? ` in week ${entrant.eliminated_week}` : ""}
          </span>
          {opgg ? (
            <a href={opgg} target="_blank" rel="noreferrer" className="text-action-text hover:underline">
              · op.gg
            </a>
          ) : null}
        </span>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_2fr]">
        <Panel title="Overall" aside={card ? `${card.tier.label} · ${card.archetype}` : undefined}>
          {card ? (
            <>
              <p className="type-display text-6xl text-white">{card.overall}</p>
              <p className="text-sm text-muted">
                {rating!.games} game{rating!.games === 1 ? "" : "s"} · {rating!.wins}–{rating!.losses}
              </p>
              <ul className="flex flex-col gap-2">
                {card.subStats.map((stat) => (
                  <li key={stat.key} className="flex items-center gap-2 text-sm">
                    <span className="w-24 shrink-0 text-muted">{stat.label}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded bg-canvas">
                      <span className="block h-full rounded bg-action-fill" style={{ width: `${Math.max(0, Math.min(100, stat.value))}%` }} />
                    </span>
                    <span className="w-8 text-right tabular-nums text-white">{stat.value}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Empty>No rated games yet. A rating appears after the first ingested game.</Empty>
          )}
        </Panel>

        <Panel title="Week by week">
          {rating && rating.weekly.length > 0 ? (
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>Week</th>
                    <th className={`${thClass} text-right`}>Games</th>
                    <th className={`${thClass} text-right`}>Week OVR</th>
                  </tr>
                </thead>
                <tbody>
                  {rating.weekly.map((week) => (
                    <tr key={week.week}>
                      <td className={tdClass}>Week {week.week}</td>
                      <td className={`${tdClass} text-right tabular-nums`}>{week.games}</td>
                      <td className={`${tdClass} text-right`}>
                        <Overall value={week.overall} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Nothing played yet.</Empty>
          )}
        </Panel>
      </div>

      <Panel title="Teams">
        {memberships.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {memberships.map(({ member, team, week }) => {
              const matches = view.matches.filter((match) => match.team_a_id === team.id || match.team_b_id === team.id);
              return (
                <li key={team.id} className="rounded-md border border-border-subtle p-3">
                  <p className="text-sm">
                    <span className="font-display font-semibold text-white">Week {week.week_number}</span>{" "}
                    <span className="text-muted">
                      · {team.name} · {ROLE_LABELS[member.role]}
                      {team.captain_entrant_id === entrant.id ? " · Captain" : member.price != null ? ` · bought for ${member.price}` : ""}
                      {team.tier === "elimination" ? " · Elimination tier" : ""}
                    </span>
                  </p>
                  {matches.length > 0 ? (
                    <ul className="mt-2 flex flex-col gap-1 text-sm">
                      {matches.map((match) => {
                        const opponentId = match.team_a_id === team.id ? match.team_b_id : match.team_a_id;
                        const [a, b] = matchScore(view, match);
                        const [us, them] = match.team_a_id === team.id ? [a, b] : [b, a];
                        const result = match.winner_team_id ? (match.winner_team_id === team.id ? "Won" : "Lost") : "To play";
                        return (
                          <li key={match.id} className="flex flex-wrap justify-between gap-2">
                            <span>
                              vs {view.teamsById.get(opponentId)?.name ?? "TBD"}{" "}
                              <span className="text-xs text-muted">
                                {STAGE_LABELS[match.stage]} · Bo{match.best_of}
                              </span>
                            </span>
                            <span className={result === "Won" ? "text-success" : result === "Lost" ? "text-danger" : "text-muted"}>
                              {result} {us}–{them}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>Not drafted yet.</Empty>
        )}
      </Panel>

      <Panel title="Games">
        {games.length > 0 ? (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Date</th>
                  <th className={thClass}>Champion</th>
                  <th className={thClass}>Team</th>
                  <th className={`${thClass} text-right`}>K / D / A</th>
                  <th className={`${thClass} text-right`}>CS</th>
                  <th className={`${thClass} text-right`}>Result</th>
                </tr>
              </thead>
              <tbody>
                {games.map((row) => (
                  <tr key={row.match_id}>
                    <td className={`${tdClass} text-muted`}>{row.game_date ? row.game_date.slice(0, 10) : "—"}</td>
                    <td className={tdClass}>{row.champion ?? "—"}</td>
                    <td className={`${tdClass} text-muted`}>{row.team_name ?? "—"}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>
                      {row.kills ?? 0} / {row.deaths ?? 0} / {row.assists ?? 0}
                    </td>
                    <td className={`${tdClass} text-right tabular-nums`}>{row.cs ?? 0}</td>
                    <td className={`${tdClass} text-right ${row.win ? "text-success" : "text-danger"}`}>{row.win ? "Win" : "Loss"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No ingested games yet.</Empty>
        )}
      </Panel>

      <Link href="/offseason" className="text-sm font-semibold text-action-text hover:underline">
        ← Back to the offseason
      </Link>
    </OffseasonShell>
  );
}

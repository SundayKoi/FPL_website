import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { buildScoreboard, seriesRecord, type RawStatRow } from "@/lib/match/scoreboard";
import { formatKickoff, hasResult, stageMeta, teamLabel } from "@/lib/schedule/format";
import { teamSlug } from "@/lib/teams/teamPage";
import type { FixtureRow } from "@/lib/schedule/types";
import type { MatchDraftRow } from "@/lib/match-draft/types";
import MatchDraftSummary from "@/components/matches/MatchDraftSummary";

const int = new Intl.NumberFormat("en-US");

function TeamLink({ name }: { name: string }) {
  if (name === "TBD") return <span className="text-steel">{name}</span>;
  return (
    <Link href={`/teams/${teamSlug(name)}`} className="hover:text-coral hover:underline">
      {name}
    </Link>
  );
}

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  const { data: fixtureRow } = await supabase.from("fixtures").select("*").eq("id", id).single();
  if (!fixtureRow) notFound();
  const fixture = fixtureRow as FixtureRow;

  // fixtures -> match_reports -> match_report_games gives the Riot match ids
  // the nightly ingest wrote raw_stats rows under. The drafter's own record
  // of the pick/ban phase is fetched alongside — it exists the moment a
  // draft finishes, usually well before any stats do.
  const [{ data: reports }, { data: draftRows }] = await Promise.all([
    supabase.from("match_reports").select("id, forfeit_team_id, forfeit_note").eq("fixture_id", id),
    supabase.from("match_drafts").select("*").eq("fixture_id", id).order("game_number"),
  ]);
  const reportRows = (reports as { id: string; forfeit_team_id: string | null; forfeit_note: string | null }[]) ?? [];
  const reportIds = reportRows.map((r) => r.id);
  // A forfeited series shows a score its games cannot account for — 2-0 with
  // one scoreboard below it. Without a line saying so, the page looks like it
  // is missing data. One extra query, and only when there is something to say.
  const forfeit = reportRows.find((r) => r.forfeit_team_id) ?? null;
  let forfeitTeamName: string | null = null;
  if (forfeit?.forfeit_team_id) {
    const { data: team } = await supabase
      .from("league_teams")
      .select("name")
      .eq("id", forfeit.forfeit_team_id)
      .maybeSingle();
    forfeitTeamName = (team as { name: string } | null)?.name ?? null;
  }
  const draftGames = (((draftRows as MatchDraftRow[]) ?? [])).map((row) => ({
    gameNumber: row.game_number,
    blueTeamName: row.blue_team_name ?? fixture.team_a,
    redTeamName: row.red_team_name ?? fixture.team_b,
    winnerTeam: row.winner_team ?? null,
    actions: (row.actions ?? []).filter((action) => Boolean(action && (action.champion || action.skipped))),
    positions: row.positions ?? null,
  }));

  let rows: RawStatRow[] = [];
  if (reportIds.length > 0) {
    const { data: reportGames } = await supabase
      .from("match_report_games")
      .select("match_id")
      .in("report_id", reportIds);
    const matchIds = ((reportGames as { match_id: string }[]) ?? []).map((g) => g.match_id);
    if (matchIds.length > 0) {
      const { data: stats } = await supabase
        .from("raw_stats")
        .select(
          "match_id, game_date, game_duration_min, team_side, team_name, summoner_name, champion, role, kills, deaths, assists, cs, gold_earned, total_damage_to_champions, vision_score, win"
        )
        .in("match_id", matchIds);
      rows = (stats as RawStatRow[]) ?? [];
    }
  }

  const games = buildScoreboard(rows);
  const record = seriesRecord(games);
  const teamA = teamLabel(fixture.team_a);
  const teamB = teamLabel(fixture.team_b);
  const played = hasResult(fixture);

  return (
    <main className="bg-hash mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10 text-white">
      <header className="card-brand flex flex-col gap-2 p-5">
        <span className="label-dash">
          {stageMeta(fixture.stage).label}
          {fixture.division ? ` · ${fixture.division}` : ""}
        </span>
        <h1 className="type-display flex flex-wrap items-center gap-3 text-2xl">
          <TeamLink name={teamA} />
          <span className="rounded border border-line bg-navy px-3 py-1 text-xl">
            {played ? `${fixture.score_a}–${fixture.score_b}` : "vs"}
          </span>
          <TeamLink name={teamB} />
        </h1>
        <p className="text-sm text-steel">
          {formatKickoff(fixture.scheduled_at)} · Best of {fixture.best_of}
          {games.length > 0 ? ` · ${games.length} game${games.length === 1 ? "" : "s"} on record` : ""}
        </p>
        {forfeit && (
          <p className="text-sm text-gold">
            Won by forfeit{forfeitTeamName ? ` — ${forfeitTeamName} did not finish the series` : ""}
            {forfeit.forfeit_note ? ` (${forfeit.forfeit_note})` : ""}.
            {games.length > 0
              ? " The games below were played in full and count for player stats."
              : " No games were played."}
          </p>
        )}
        <Link href="/schedule" className="text-xs text-steel underline-offset-4 hover:text-coral hover:underline">
          ← Back to the schedule
        </Link>
      </header>

      <MatchDraftSummary games={draftGames} />

      {games.length === 0 ? (
        <section className="card-brand p-6 text-sm text-steel">
          {forfeit
            ? "Nothing was played — this series was settled by forfeit."
            : played
              ? "No game data for this match yet. Stats appear once the report has been submitted with this fixture attached and the nightly ingest has run."
              : "This match hasn't been played yet."}
        </section>
      ) : (
        games.map((game) => (
          <section key={game.matchId} className="card-brand flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="label-dash">Game {game.gameNumber}</h2>
              <span className="text-xs text-steel">
                {game.durationMin != null ? `${game.durationMin.toFixed(0)} min` : ""}
                {game.sides.length === 2
                  ? ` · ${game.sides.find((s) => s.won)?.teamName ?? "?"} win`
                  : ""}
              </span>
            </div>

            {game.sides.map((side) => (
              <div key={side.side} className="overflow-x-auto">
                <div className="mb-1 flex items-center gap-2 text-sm">
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      side.side === "Blue"
                        ? "bg-sky-500/20 text-sky-300"
                        : "bg-red-500/20 text-red-300"
                    }`}
                  >
                    {side.side}
                  </span>
                  <span className={side.won ? "font-semibold text-gold" : "text-steel"}>
                    {side.teamName} {side.won ? "· Win" : "· Loss"}
                  </span>
                  <span className="ml-auto text-xs text-steel">
                    {side.totals.kills}/{side.totals.deaths}/{side.totals.assists} ·{" "}
                    {int.format(side.totals.gold)}g
                  </span>
                </div>
                <table className="w-full min-w-[34rem] text-left text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-steel">
                      <th className="py-1 pr-2 font-semibold">Player</th>
                      <th className="py-1 pr-2 font-semibold">Champion</th>
                      <th className="py-1 pr-2 font-semibold">KDA</th>
                      <th className="py-1 pr-2 font-semibold">CS</th>
                      <th className="py-1 pr-2 font-semibold">Gold</th>
                      <th className="py-1 pr-2 font-semibold">Damage</th>
                      <th className="py-1 font-semibold">Vision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {side.players.map((p) => (
                      <tr key={`${p.summonerName}-${p.champion}`} className="border-t border-line/60">
                        <td className="truncate py-1 pr-2">
                          <Link
                            href={`/players/${encodeURIComponent(p.summonerName)}`}
                            className="underline-offset-4 hover:text-coral hover:underline"
                          >
                            {p.summonerName}
                          </Link>
                        </td>
                        <td className="truncate py-1 pr-2 text-steel">{p.champion}</td>
                        <td className="py-1 pr-2">
                          {p.kills}/{p.deaths}/{p.assists}
                        </td>
                        <td className="py-1 pr-2 text-steel">{p.cs}</td>
                        <td className="py-1 pr-2 text-steel">{int.format(p.gold)}</td>
                        <td className="py-1 pr-2 text-steel">{int.format(p.damage)}</td>
                        <td className="py-1 text-steel">{p.visionScore}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </section>
        ))
      )}

      {games.length > 0 && Object.keys(record).length > 0 && (
        <p className="text-center text-xs text-steel">
          Series by games won:{" "}
          {Object.entries(record)
            .map(([team, wins]) => `${team} ${wins}`)
            .join(" · ")}
        </p>
      )}
    </main>
  );
}

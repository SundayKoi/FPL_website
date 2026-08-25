import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { ROLE_LABELS_SHORT, type Draft, type Player, type Profile, type Team } from "@/lib/draft/types";
import { toRosterTeams } from "@/lib/teams/roster";
import {
  didWin,
  opponentOf,
  splitTeamFixtures,
  teamRecord,
  teamSlug,
} from "@/lib/teams/teamPage";
import { opggMultiSearchUrlFromRosterPlayers } from "@/lib/opgg/multiSearch";
import { academyOpggUrlForPlayer } from "@/lib/academy/playerSheet";
import { fetchAcademyPlayers, individualOpggUrl } from "@/lib/academy/playerSheet";
import { normalizePlayerName } from "@/lib/players/freeAgency";
import { formatKickoff, stageMeta } from "@/lib/schedule/format";
import type { FixtureRow } from "@/lib/schedule/types";
import { sideRows, type DraftSummaryGame } from "@/components/matches/MatchDraftSummary";
import { linkedAccountLabel, linkedAccountUrls } from "@/lib/players/linkedAccounts";
import TeamRecentDrafts, { type TeamDraftRow } from "@/components/teams/TeamRecentDrafts";
import PlayerRosterClaim from "@/components/teams/PlayerRosterClaim";
import type { MatchDraftAction, MatchDraftPositions } from "@/lib/match-draft/types";
import { fetchRosterClaimStates } from "@/lib/teams/rosterClaims";


/**
 * Per-team page: roster (with stats deep links), series record, results,
 * and upcoming fixtures. Roster comes from the featured draft; record and
 * fixtures come from the schedule, matched on team NAME — fixtures and
 * stats both store team names as text rather than FKs (see the fixtures
 * migration), so name is the only join key available.
 */
export async function TeamPageContent({ params, league = "premier" }: { params: Promise<{ slug: string }>; league?: "premier" | "academy" }) {
  const { slug } = await params;
  const supabase = await createServerSupabase();

  const [{ data: settings }, { data: academyFallback }] = await Promise.all([
    supabase
      .from("league_settings")
      .select("featured_draft_id, academy_draft_id, current_season, academy_season")
      .eq("id", 1)
      .single(),
    league === "academy"
      ? supabase.from("drafts").select("id").eq("name", "S1 Academy").maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const draftId = league === "academy"
    ? settings?.academy_draft_id ?? academyFallback?.id
    : settings?.featured_draft_id;
  if (!draftId) notFound();

  const [draftResult, teamsResult, playersResult, profilesResult, canonicalResult, fixturesResult, leagueTeamsResult, viewerResult, academySheetPlayers] =
    await Promise.all([
      supabase.from("drafts").select("*").eq("id", draftId).single(),
      supabase
        .from("teams")
        .select("*")
        .eq("draft_id", draftId)
        .order("nomination_position"),
      supabase.from("players").select("*").eq("draft_id", draftId).order("display_name"),
      supabase.from("profiles").select("id, display_name").order("display_name"),
      supabase.from("player_pool").select("id, display_name, rank, opgg_url").eq("season_key", league === "academy" ? "academy-1" : "season-5"),
      supabase.from("fixtures").select("*").order("scheduled_at"),
      supabase.from("league_teams").select("id, name").eq("active", true),
      supabase.auth.getUser().then((result) => result, () => ({ data: { user: null } })),
      league === "academy" ? fetchAcademyPlayers() : Promise.resolve([]),
    ]);

  const draft = draftResult.data as Draft | null;
  const academySheetByName = new Map(academySheetPlayers.map((player) => [normalizePlayerName(player.name), player.opggUrl]));
  // Academy rows without a stored opgg_url fall back to the sheet's link,
  // then to the constructed Academy URL; Premier rows stay null.
  const withAcademyOpgg = <T extends { display_name: string; opgg_url: string | null }>(player: T): T => ({
    ...player,
    opgg_url: player.opgg_url?.trim()
      ? player.opgg_url
      : league === "academy"
        ? individualOpggUrl(academySheetByName.get(normalizePlayerName(player.display_name)), player.display_name) ??
          academyOpggUrlForPlayer(player.display_name)
        : null,
  });
  const canonicalPlayers = ((canonicalResult.data as { id: string; display_name: string; rank: string | null; opgg_url: string | null }[]) ?? [])
    .map(withAcademyOpgg);
  const draftPlayers = ((playersResult.data as Player[]) ?? []).map(withAcademyOpgg);
  const rosterTeams = toRosterTeams(
    (teamsResult.data as Team[]) ?? [],
    draftPlayers,
    (profilesResult.data as Profile[]) ?? [],
    canonicalPlayers,
  );
  const team = rosterTeams.find((t) => teamSlug(t.name) === slug);
  if (!team) notFound();

  // Scope the schedule to the season the featured draft belongs to when we
  // know it, so an old team page doesn't mix in a later split's fixtures.
  const allFixtures = (fixturesResult.data as FixtureRow[]) ?? [];
  const season = (league === "academy" ? settings?.academy_season : settings?.current_season) ?? null;
  const fixtures = season ? allFixtures.filter((f) => f.season === season) : allFixtures;
  const leagueTeamId = ((leagueTeamsResult.data as { id: string; name: string }[] | null) ?? [])
    .find((candidate) => candidate.name.trim().toLowerCase() === team.name.trim().toLowerCase())?.id ?? null;
  const viewerProfileId = viewerResult.data.user?.id ?? null;
  const draftPlayerById = new Map(draftPlayers.map((player) => [player.id, player]));
  let rosterClaimStates = {} as Awaited<ReturnType<typeof fetchRosterClaimStates>>;
  let rosterClaimsUnavailable = false;
  if (season) {
    try {
      rosterClaimStates = await fetchRosterClaimStates(
        supabase,
        team.players.map((player) => ({
          id: player.id,
          canonicalPlayerId: player.isEmpty
            ? null
            : draftPlayerById.get(player.id)?.canonical_player_id ?? null,
        })),
        league,
        season,
        viewerProfileId,
      );
    } catch {
      rosterClaimsUnavailable = true;
    }
  }
  const teamReturnPath = league === "academy" ? `/academy/teams/${slug}` : `/teams/${slug}`;

  const record = teamRecord(fixtures, team.name);
  const { upcoming, results } = splitTeamFixtures(fixtures, team.name);

  // "Recent drafts": game 1's picks and bans for the team's last few
  // series, from the site drafter's own records (same source the match
  // pages read). Fixtures with no drafted games simply don't appear.
  const recentFixtures = results.slice(0, 5);
  const { data: teamDraftData } = recentFixtures.length
    ? await supabase
        .from("match_drafts")
        .select("fixture_id, game_number, blue_team_name, red_team_name, actions, positions")
        .in("fixture_id", recentFixtures.map((f) => f.id))
        .order("game_number")
    : { data: [] };
  const teamDraftRowsRaw = (teamDraftData ?? []) as {
    fixture_id: string;
    game_number: number;
    blue_team_name: string | null;
    red_team_name: string | null;
    actions: MatchDraftAction[] | null;
    positions: MatchDraftPositions | null;
  }[];
  const sameName = (a?: string | null, b?: string | null) =>
    Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
  const recentDraftRows: TeamDraftRow[] = recentFixtures.flatMap((fixture) => {
    const drafted = teamDraftRowsRaw.filter(
      (row) =>
        row.fixture_id === fixture.id &&
        (row.actions ?? []).some((action) => Boolean(action && (action.champion || action.skipped))),
    );
    const first = drafted[0];
    if (!first) return [];
    const game: DraftSummaryGame = {
      gameNumber: first.game_number,
      blueTeamName: first.blue_team_name ?? fixture.team_a,
      redTeamName: first.red_team_name ?? fixture.team_b,
      winnerTeam: null,
      actions: (first.actions ?? []).filter((action) => Boolean(action && (action.champion || action.skipped))),
      positions: first.positions ?? null,
    };
    const side = sameName(game.blueTeamName, team.name)
      ? ("blue" as const)
      : sameName(game.redTeamName, team.name)
        ? ("red" as const)
        : null;
    if (!side) return [];
    const { picks, bans, confirmed } = sideRows(game, side);
    return [
      {
        fixtureId: fixture.id,
        opponent: opponentOf(fixture, team.name),
        won: didWin(fixture, team.name),
        score: fixture.score_a != null && fixture.score_b != null ? `${fixture.score_a}–${fixture.score_b}` : null,
        stageLabel: stageMeta(fixture.stage).label,
        picks,
        bans,
        confirmed,
      },
    ];
  });
  const multiOpggUrl = opggMultiSearchUrlFromRosterPlayers(team.players);
  const winRate =
    record.seriesPlayed > 0 ? ((record.wins / record.seriesPlayed) * 100).toFixed(0) : null;

  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <Link
          href={league === "academy" ? "/academy/teams" : "/teams"}
          className="flex w-fit items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-steel transition hover:border-coral hover:text-coral"
        >
          <span aria-hidden="true">←</span> All teams
        </Link>

        <header
          className="card-brand mt-6 flex flex-wrap items-end justify-between gap-6 overflow-hidden p-6 sm:p-8"
          style={{ backgroundColor: team.bannerColor }}
        >
          <div className="flex min-w-0 items-center gap-4">
            {team.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={team.imageUrl}
                alt={`${team.name} logo`}
                className="h-20 w-20 shrink-0 rounded object-contain"
              />
            ) : (
              <span className="type-display shrink-0 text-5xl text-white/90" aria-hidden="true">
                {team.abbreviation}
              </span>
            )}
            <div className="min-w-0">
              <h1 className="type-display text-4xl text-white sm:text-5xl">{team.name}</h1>
              <p className="mt-1 text-sm text-white/80">
                Captain {team.captainName}
                {team.division ? ` · ${team.division}` : ""}
                {draft?.name ? ` · ${draft.name}` : ""}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="type-display text-4xl text-white">
              {record.wins}–{record.losses}
            </p>
            <p className="text-xs uppercase tracking-[0.14em] text-white/80">
              {winRate !== null ? `${winRate}% series` : "No series played"}
            </p>
            {multiOpggUrl ? (
              <a
                href={multiOpggUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex rounded-full border border-coral/80 bg-coral/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-coral transition hover:bg-coral hover:text-navy"
              >
                Team OP.GG Multi
              </a>
            ) : null}
          </div>
        </header>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* No overflow-hidden: the last player's account menu opens past
              the card's bottom edge and must stay clickable. */}
          <section aria-labelledby="roster-heading" className="card-brand">
            <h2 id="roster-heading" className="border-b border-line px-4 py-3 type-display text-xl">
              Roster
            </h2>
            <ul className="divide-y divide-line/80">
              {team.players.map((player) => (
                <li key={player.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-9 shrink-0 font-display text-xs font-semibold not-italic text-steel">
                    {ROLE_LABELS_SHORT[player.role]}
                  </span>
                  {player.isEmpty ? (
                    <span className="min-w-0 flex-1 truncate text-sm text-steel/70">
                      {player.displayName}
                    </span>
                  ) : (
                    // Native disclosure menu: click a player for their stats
                    // profile or linked OP.GG accounts (from the league's
                    // account sheet, falling back to the stored roster link).
                    <details name="player-account-menu" className="group relative min-w-0 flex-1">
                      <summary className="flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0 truncate text-sm font-semibold text-white underline-offset-4 group-open:text-coral group-hover:text-coral group-hover:underline">
                          {player.displayName}
                        </span>
                        <span aria-hidden className="text-[0.55rem] text-steel transition group-open:rotate-180">
                          ▾
                        </span>
                      </summary>
                      <div className="absolute left-0 top-full z-20 mt-1 flex min-w-48 flex-col rounded border border-line bg-navy p-1 shadow-lg">
                        <Link
                          href={`/players/${encodeURIComponent(player.displayName)}`}
                          className="rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-steel transition hover:bg-line/40 hover:text-white"
                        >
                          Stats profile
                        </Link>
                        {(linkedAccountUrls(player.displayName).length
                          ? linkedAccountUrls(player.displayName)
                          : player.opggUrl?.trim() && player.opggUrl !== "#"
                            ? [player.opggUrl]
                            : []
                        ).map((url, index) => (
                          <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-steel transition hover:bg-line/40 hover:text-white"
                          >
                            {linkedAccountLabel(url, index)} ↗
                          </a>
                        ))}
                      </div>
                    </details>
                  )}
                  {!player.isEmpty && leagueTeamId && season ? (
                    <PlayerRosterClaim
                      playerPoolId={draftPlayerById.get(player.id)?.canonical_player_id ?? null}
                      leagueTeamId={leagueTeamId}
                      league={league}
                      season={season}
                      returnPath={teamReturnPath}
                      signedIn={viewerProfileId !== null}
                      state={rosterClaimStates[player.id]?.state ?? "unclaimed"}
                      claimLinkId={rosterClaimStates[player.id]?.claimLinkId ?? null}
                      unavailable={rosterClaimsUnavailable}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          <div className="flex flex-col gap-6">
            <section aria-labelledby="upcoming-heading" className="card-brand overflow-hidden">
              <h2
                id="upcoming-heading"
                className="border-b border-line px-4 py-3 type-display text-xl"
              >
                Upcoming
              </h2>
              {upcoming.length === 0 ? (
                <p className="px-4 py-4 text-sm text-steel">No scheduled matches.</p>
              ) : (
                <ul className="divide-y divide-line/60">
                  {upcoming.slice(0, 5).map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-steel">
                        {stageMeta(f.stage).label}
                      </span>
                      <span className="text-sm font-semibold text-white">
                        vs {opponentOf(f, team.name)}
                      </span>
                      <span className="ml-auto text-xs text-steel">
                        {formatKickoff(f.scheduled_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="results-heading" className="card-brand overflow-hidden">
              <h2
                id="results-heading"
                className="border-b border-line px-4 py-3 type-display text-xl"
              >
                Results
              </h2>
              {results.length === 0 ? (
                <p className="px-4 py-4 text-sm text-steel">No results reported yet.</p>
              ) : (
                <ul className="divide-y divide-line/60">
                  {results.map((f) => {
                    const won = didWin(f, team.name);
                    return (
                      <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                        <span
                          className={`w-6 shrink-0 rounded text-center text-xs font-bold ${
                            won === null
                              ? "text-steel"
                              : won
                                ? "bg-mint/15 text-mint"
                                : "bg-red-500/15 text-red-400"
                          }`}
                        >
                          {won === null ? "–" : won ? "W" : "L"}
                        </span>
                        <Link
                          href={`/match/${f.id}`}
                          className="text-sm font-semibold text-white underline-offset-4 hover:text-coral hover:underline"
                        >
                          vs {opponentOf(f, team.name)}
                        </Link>
                        <span className="rounded border border-line bg-navy px-2 py-0.5 text-xs font-bold text-white">
                          {f.score_a}–{f.score_b}
                        </span>
                        <span className="ml-auto text-xs text-steel">
                          {stageMeta(f.stage).label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>

        <div className="mt-6">
          <TeamRecentDrafts rows={recentDraftRows} />
        </div>
      </div>
    </main>
  );
}

export default async function TeamPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams?: Promise<{ league?: string }> }) {
  const league = (await searchParams)?.league === "academy" ? "academy" : "premier";
  return <TeamPageContent params={params} league={league} />;
}

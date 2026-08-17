import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Draft, Player, Profile, Team } from "@/lib/draft/types";
import { toRosterTeams } from "@/lib/teams/roster";
import {
  didWin,
  opponentOf,
  splitTeamFixtures,
  teamRecord,
  teamSlug,
} from "@/lib/teams/teamPage";
import { opggMultiSearchUrlFromRosterPlayers } from "@/lib/opgg/multiSearch";
import { formatKickoff, stageMeta } from "@/lib/schedule/format";
import type { FixtureRow } from "@/lib/schedule/types";

const roleLabels = {
  top: "TOP",
  jungle: "JG",
  mid: "MID",
  adc: "ADC",
  support: "SUP",
} as const;

/**
 * Per-team page: roster (with stats deep links), series record, results,
 * and upcoming fixtures. Roster comes from the featured draft; record and
 * fixtures come from the schedule, matched on team NAME — fixtures and
 * stats both store team names as text rather than FKs (see the fixtures
 * migration), so name is the only join key available.
 */
async function TeamPageContent({ params, league = "premier" }: { params: Promise<{ slug: string }>; league?: "premier" | "academy" }) {
  const { slug } = await params;
  const supabase = await createServerSupabase();

  const { data: settings } = await supabase
    .from("league_settings")
    .select("featured_draft_id, academy_draft_id, current_season, academy_season")
    .eq("id", 1)
    .single();
  const draftId = league === "academy" ? settings?.academy_draft_id : settings?.featured_draft_id;
  if (!draftId) notFound();

  const [draftResult, teamsResult, playersResult, profilesResult, canonicalResult, fixturesResult] =
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
    ]);

  const draft = draftResult.data as Draft | null;
  const rosterTeams = toRosterTeams(
    (teamsResult.data as Team[]) ?? [],
    (playersResult.data as Player[]) ?? [],
    (profilesResult.data as Profile[]) ?? [],
    (canonicalResult.data as { id: string; display_name: string; rank: string | null; opgg_url: string | null }[]) ?? [],
  );
  const team = rosterTeams.find((t) => teamSlug(t.name) === slug);
  if (!team) notFound();

  // Scope the schedule to the season the featured draft belongs to when we
  // know it, so an old team page doesn't mix in a later split's fixtures.
  const allFixtures = (fixturesResult.data as FixtureRow[]) ?? [];
  const season = (league === "academy" ? settings?.academy_season : settings?.current_season) ?? null;
  const fixtures = season ? allFixtures.filter((f) => f.season === season) : allFixtures;

  const record = teamRecord(fixtures, team.name);
  const { upcoming, results } = splitTeamFixtures(fixtures, team.name);
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
                className="mt-3 inline-flex rounded-full border border-white/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:border-coral hover:text-coral"
              >
                Team OP.GG Multi
              </a>
            ) : null}
          </div>
        </header>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section aria-labelledby="roster-heading" className="card-brand overflow-hidden">
            <h2 id="roster-heading" className="border-b border-line px-4 py-3 type-display text-xl">
              Roster
            </h2>
            <ul className="divide-y divide-line/80">
              {team.players.map((player) => (
                <li key={player.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-9 shrink-0 font-display text-xs font-semibold not-italic text-steel">
                    {roleLabels[player.role]}
                  </span>
                  {player.isEmpty ? (
                    <span className="min-w-0 flex-1 truncate text-sm text-steel/70">
                      {player.displayName}
                    </span>
                  ) : (
                    <Link
                      href={`${league === "academy" ? "/academy/stats" : "/stats"}?player=${encodeURIComponent(player.displayName)}`}
                      className="min-w-0 flex-1 truncate text-sm font-semibold text-white underline-offset-4 hover:text-coral hover:underline"
                    >
                      {player.displayName}
                    </Link>
                  )}
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
                        <span className="text-sm font-semibold text-white">
                          vs {opponentOf(f, team.name)}
                        </span>
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
      </div>
    </main>
  );
}

export default async function TeamPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams?: Promise<{ league?: string }> }) {
  const league = (await searchParams)?.league === "academy" ? "academy" : "premier";
  return <TeamPageContent params={params} league={league} />;
}

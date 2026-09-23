import Link from "next/link";
import { redirect } from "next/navigation";
import BroadcasterFixtureHeader from "@/components/broadcaster/BroadcasterFixtureHeader";
import BroadcasterWorkspace from "@/components/broadcaster/BroadcasterWorkspace";
import { canAccessBroadcaster, fetchStaffTier } from "@/lib/auth/staffTier";
import {
  loadBroadcasterScouting,
  resolveBroadcasterFixture,
} from "@/lib/broadcaster/workspace";
import { resolveLeagueView, type LeagueView } from "@/lib/league/context";
import { stageMeta } from "@/lib/schedule/format";
import type { FixtureRow } from "@/lib/schedule/types";
import { createServerSupabase } from "@/lib/supabase/server";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// One pill style for the league switch and the night's games alike.
const pillClass = "inline-flex items-center justify-center rounded px-4 py-2 text-xs uppercase tracking-[0.14em] transition";
const activePillClass = `${pillClass} bg-action-fill font-bold text-white`;
const idlePillClass = `${pillClass} text-muted/60 hover:bg-surface hover:text-action-text`;

function LeagueLinks({ league }: { league: LeagueView }) {
  return (
    <nav aria-label="League" className="inline-flex gap-1 rounded-md border border-border-strong bg-canvas p-1">
      {([
        { id: "premier" as const, label: "Premier" },
        { id: "academy" as const, label: "Academy" },
      ]).map((item) => (
        <Link
          key={item.id}
          href={`/broadcaster?league=${item.id}`}
          aria-current={league === item.id ? "page" : undefined}
          className={league === item.id ? activePillClass : idlePillClass}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The night's games, grouped by stage in bracket order, so a caster can switch
 * between them without going through the admin's featured pick. A fixture with
 * a TBD side still lists — casters follow the bracket — but there is nothing to
 * scout yet, so its pill is not a link.
 */
function TonightsGames({
  league,
  upcoming,
  selectedFixtureId,
}: {
  league: LeagueView;
  upcoming: FixtureRow[];
  selectedFixtureId: string | null;
}) {
  if (upcoming.length <= 1) return null;
  const stages = [...new Set(upcoming.map((fixture) => fixture.stage))];

  return (
    <nav aria-label="Tonight's games" className="flex flex-wrap items-end gap-4">
      {/* Back to whatever the admin's featured pick resolves to. */}
      <div className="inline-flex gap-1 rounded-md border border-border-strong bg-canvas p-1">
        <Link href={`/broadcaster?league=${league}`} className={idlePillClass}>
          Featured
        </Link>
      </div>
      {stages.map((stage) => (
        <div key={stage} className="inline-flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/60">
            {stageMeta(stage).label}
          </span>
          <div className="inline-flex flex-wrap gap-1 rounded-md border border-border-strong bg-canvas p-1">
            {upcoming
              .filter((fixture) => fixture.stage === stage)
              .map((fixture) => {
                const label = `${fixture.team_a ?? "TBD"} vs ${fixture.team_b ?? "TBD"}`;
                if (!fixture.team_a || !fixture.team_b) {
                  return (
                    <span key={fixture.id} aria-disabled="true" className={`${pillClass} text-muted/40`}>
                      {label}
                    </span>
                  );
                }
                const selected = fixture.id === selectedFixtureId;
                return (
                  <Link
                    key={fixture.id}
                    href={`/broadcaster?league=${league}&fixture=${fixture.id}`}
                    aria-current={selected ? "page" : undefined}
                    className={selected ? activePillClass : idlePillClass}
                  >
                    {label}
                  </Link>
                );
              })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export default async function BroadcasterPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createServerSupabase();
  const tier = await fetchStaffTier(supabase);
  if (!canAccessBroadcaster(tier)) redirect("/");

  const params = await searchParams;
  const league = resolveLeagueView(params.league);
  const requestedFixtureId = typeof params.fixture === "string" ? params.fixture : null;
  const context = await resolveBroadcasterFixture(supabase, league, requestedFixtureId);
  const games = (
    <TonightsGames league={league} upcoming={context.upcoming} selectedFixtureId={context.fixture?.id ?? null} />
  );

  if (!context.fixture) {
    return (
      <main className="page-backdrop flex-1">
        <div className="page-container page-spacing w-full space-y-8">
          <header className="border-b border-border-subtle pb-8">
            <span className="label-dash">Broadcast desk</span>
            <h1 className="type-display mt-3 text-5xl sm:text-6xl">Broadcaster workspace</h1>
          </header>
          <LeagueLinks league={league} />
          {games}
          <section className="card-brand p-5">
            <p className="text-sm text-muted">
              No {league === "academy" ? "Academy" : "Premier"} featured match is available.
            </p>
            <Link href="/admin" className="mt-4 inline-flex text-sm font-semibold text-action-text hover:text-white">
              Choose the featured matchup
            </Link>
          </section>
        </div>
      </main>
    );
  }

  let scouting: Awaited<ReturnType<typeof loadBroadcasterScouting>> = null;
  try {
    scouting = await loadBroadcasterScouting(supabase, context);
  } catch (error) {
    console.error("Unable to load broadcaster scouting", error);
  }

  if (!scouting) {
    return (
      <main className="page-backdrop flex-1">
        <div className="page-container page-spacing w-full space-y-6">
          <BroadcasterFixtureHeader fixture={context.fixture} twitchUrl={context.settings.twitchUrl} />
          <LeagueLinks league={league} />
          {games}
          <section className="card-brand p-5" aria-label="Scouting unavailable">
            <p className="text-sm text-muted">Scouting data is temporarily unavailable.</p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="page-backdrop flex-1">
      <div className="page-container page-spacing w-full space-y-6">
        {games}
        <BroadcasterWorkspace
          league={league}
          fixture={context.fixture}
          settings={context.settings}
          teamA={scouting.teamA}
          teamB={scouting.teamB}
          playerDetails={scouting.playerDetails}
        />
      </div>
    </main>
  );
}

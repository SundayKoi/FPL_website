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
import { createServerSupabase } from "@/lib/supabase/server";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function LeagueLinks({ league }: { league: LeagueView }) {
  return (
    <nav aria-label="League" className="inline-flex gap-1 rounded-md border border-line bg-navy p-1">
      {([
        { id: "premier" as const, label: "Premier" },
        { id: "academy" as const, label: "Academy" },
      ]).map((item) => (
        <Link
          key={item.id}
          href={`/broadcaster?league=${item.id}`}
          aria-current={league === item.id ? "page" : undefined}
          className={`inline-flex items-center justify-center rounded px-4 py-2 text-xs uppercase tracking-[0.14em] transition ${
            league === item.id
              ? "bg-coral font-bold text-navy"
              : "text-steel/60 hover:bg-panel hover:text-steel"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export default async function BroadcasterPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createServerSupabase();
  const tier = await fetchStaffTier(supabase);
  if (!canAccessBroadcaster(tier)) redirect("/");

  const league = resolveLeagueView((await searchParams).league);
  const context = await resolveBroadcasterFixture(supabase, league);

  if (!context.fixture) {
    return (
      <main className="bg-hash flex-1">
        <div className="mx-auto w-full max-w-[1800px] space-y-8 px-4 py-12 sm:px-6 sm:py-16">
          <header className="border-b border-line pb-8">
            <span className="label-dash">Broadcast desk</span>
            <h1 className="type-display mt-3 text-5xl sm:text-6xl">Broadcaster workspace</h1>
          </header>
          <LeagueLinks league={league} />
          <section className="card-brand p-5">
            <p className="text-sm text-steel">
              No {league === "academy" ? "Academy" : "Premier"} featured match is available.
            </p>
            <Link href="/admin" className="mt-4 inline-flex text-sm font-semibold text-coral hover:text-white">
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
      <main className="bg-hash flex-1">
        <div className="mx-auto w-full max-w-[1800px] space-y-6 px-4 py-12 sm:px-6 sm:py-16">
          <BroadcasterFixtureHeader fixture={context.fixture} twitchUrl={context.settings.twitchUrl} />
          <LeagueLinks league={league} />
          <section className="card-brand p-5" aria-label="Scouting unavailable">
            <p className="text-sm text-steel">Scouting data is temporarily unavailable.</p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
        <BroadcasterWorkspace
          league={league}
          fixture={context.fixture}
          settings={context.settings}
          teamA={scouting.teamA}
          teamB={scouting.teamB}
        />
      </div>
    </main>
  );
}

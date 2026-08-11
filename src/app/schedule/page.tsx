import { createServerSupabase } from "@/lib/supabase/server";
import { groupByStage } from "@/lib/schedule/format";
import type { FixtureRow } from "@/lib/schedule/types";
import AdminFixturesEditor from "@/components/schedule/AdminFixturesEditor";
import FixtureCard from "@/components/schedule/FixtureCard";

export default async function SchedulePage() {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  let isAdmin = false;

  if (userData.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userData.user.id)
      .single();
    isAdmin = profile?.is_admin ?? false;
  }

  const { data } = await supabase
    .from("fixtures")
    .select("*")
    .order("stage")
    .order("sort_order");
  const fixtures = (data as FixtureRow[]) ?? [];

  const grouped = groupByStage(fixtures);
  const groups = ["Regular Season", "Gauntlet", "Playoffs"] as const;

  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="border-b border-line pb-8">
          <span className="label-dash">LEAGUE CALENDAR</span>
          <h1 className="type-display mt-3 text-5xl sm:text-6xl">Schedule</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-steel">
            Five weeks of intra-division Bo3s, then the gauntlet and playoffs.
            Matches are played Mondays at 8:00pm ET in Fearless format.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {["Mondays 8pm ET", "Fearless Format", "Solari & Lunari divisions"].map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-steel"
              >
                {chip}
              </span>
            ))}
          </div>
        </header>

        {isAdmin && (
          <div className="mt-8">
            <AdminFixturesEditor fixtures={fixtures} />
          </div>
        )}

        <div className="mt-10 flex flex-col gap-12">
          {groups.map((group) => (
            <section key={group}>
              <h2 className="label-dash">{group}</h2>
              <div className="mt-4 flex flex-col gap-4">
                {grouped
                  .filter(({ meta }) => meta.group === group)
                  .map(({ meta, fixtures: stageFixtures }) => (
                    <div key={meta.stage} className="card-brand overflow-hidden">
                      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
                        <h3 className="type-display text-xl">{meta.label}</h3>
                        <span className="text-xs text-steel">{meta.note}</span>
                      </div>
                      {stageFixtures.length === 0 ? (
                        <p className="px-4 py-4 text-sm text-steel">
                          Matchups TBD — check back once they&apos;re announced.
                        </p>
                      ) : (
                        stageFixtures.map((fixture) => (
                          <FixtureCard key={fixture.id} fixture={fixture} />
                        ))
                      )}
                    </div>
                  ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

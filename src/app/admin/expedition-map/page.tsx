import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import LivingMap from "@/components/cards/LivingMap";
import type { MapLayout } from "@/components/cards/mapLayout";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { EXPEDITION_TIERS, type ExpeditionTierKey } from "@/lib/expeditions/config";
import { MAP_FIXTURE_KEYS, MAP_STATES, MAP_STATE_LABELS, MAP_TIERS, isMapState, isMapTier, mapFixture, type MapState } from "@/lib/expeditions/mapFixtures";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Expedition map preview — FPL Admin",
};

type Search = { state?: string; tier?: string; layout?: string; motion?: string };

/**
 * PREVIEW ONLY. The living map (spec §6) drawn from fixtures
 * (mapFixtures.ts): six moments of a run on the Legend Hunt and the Mythic
 * route, and a fresh run on every other route so each terrain is seen.
 * `?state=&tier=` draws one chart the width of a run card; with neither it
 * draws the index of every chart. `?layout=phone|wide` forces a frame and
 * `?motion=reduce` holds the chart still, for looking at both on one
 * screen.
 *
 * Staff only, except in development, like the board preview beside it:
 * `npm run dev` opens it without a staff profile, so the screenshots
 * (e2e/expedition-map.spec.ts) need no sign-in and no seeding. Nothing is
 * read and nothing is sent.
 */
export default async function ExpeditionMapPreviewPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (process.env.NODE_ENV !== "development") {
    const { isAdmin, isOwner } = await fetchStaffTier(await createServerSupabase());
    if (!isAdmin && !isOwner) redirect("/admin");
  }
  const params = await searchParams;
  const layout: MapLayout | undefined = params.layout === "phone" || params.layout === "wide" ? params.layout : undefined;
  const still = params.motion === "reduce" ? true : undefined;
  const one = isMapState(params.state) || isMapTier(params.tier);

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-6 px-4 py-10 text-white sm:px-6">
      <header className="flex flex-col gap-1">
        <p className="label-dash">Staff preview · fixtures · nothing is sent</p>
        <h1 className="type-display text-3xl sm:text-4xl">The living map</h1>
      </header>

      {one ? (
        <OneChart state={isMapState(params.state) ? params.state : "mid"} tier={isMapTier(params.tier) ? params.tier : "legend"} layout={layout} still={still} />
      ) : (
        <ul data-testid="map-index" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {MAP_FIXTURE_KEYS.map(({ state, tier }) => {
            const fixture = mapFixture(state, tier);
            return (
              <li key={`${state}-${tier}`} data-testid={`map-fixture-${state}-${tier}`} className="card-brand flex flex-col gap-3 p-4">
                <Link href={`/admin/expedition-map?state=${state}&tier=${tier}`} className="flex min-h-11 flex-wrap items-baseline justify-between gap-x-3 hover:text-coral">
                  <span className="type-display text-lg">{EXPEDITION_TIERS[tier].label}</span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-steel">{MAP_STATE_LABELS[state]}</span>
                </Link>
                <LivingMap view={fixture.view} progress={fixture.progress} convoy={fixture.convoy} goal={fixture.goal} layout={layout} reducedMotion={still} />
              </li>
            );
          })}
        </ul>
      )}

      <nav aria-label="Preview charts" data-testid="map-preview-nav" className="card-brand flex flex-col gap-3 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label-dash mr-2">Moments</span>
          {MAP_STATES.map((state) => (
            <Link
              key={state}
              href={`/admin/expedition-map?state=${state}&tier=${isMapTier(params.tier) ? params.tier : "legend"}`}
              aria-current={one && params.state === state ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 ${one && params.state === state ? "border-coral text-white" : "border-line text-steel hover:text-white"}`}
            >
              {MAP_STATE_LABELS[state]}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="label-dash mr-2">Routes</span>
          {MAP_TIERS.map((tier) => (
            <Link
              key={tier}
              href={`/admin/expedition-map?state=${isMapState(params.state) ? params.state : "fresh"}&tier=${tier}`}
              aria-current={one && params.tier === tier ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 ${one && params.tier === tier ? "border-coral text-white" : "border-line text-steel hover:text-white"}`}
            >
              {EXPEDITION_TIERS[tier].label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/expedition-map" className="inline-flex min-h-11 items-center text-steel hover:text-coral">
            Every chart
          </Link>
          <Link href="/admin" className="ml-auto inline-flex min-h-11 items-center text-steel hover:text-coral">
            ← Admin
          </Link>
        </div>
      </nav>
    </main>
  );
}

/** One chart the width of a run card, in the card's own frame. */
function OneChart({ state, tier, layout, still }: { state: MapState; tier: ExpeditionTierKey; layout?: MapLayout; still?: boolean }) {
  const fixture = mapFixture(state, tier);
  return (
    <section data-testid="map-preview" data-state={state} data-tier={tier} className="card-brand flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="type-display text-xl">{EXPEDITION_TIERS[tier].label}</h2>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-steel">{MAP_STATE_LABELS[state]}</p>
      </div>
      <LivingMap view={fixture.view} progress={fixture.progress} convoy={fixture.convoy} goal={fixture.goal} layout={layout} reducedMotion={still} />
    </section>
  );
}

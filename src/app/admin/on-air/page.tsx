import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import OnAirCasterForm from "@/components/admin/OnAirCasterForm";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { ON_AIR_SPECIMEN, onAirCard } from "@/lib/cards/onAir";
import { countOnAirThisSeason, fetchOnAirDesk } from "@/lib/cards/onAirQueries";
import { oneIn } from "@/lib/cards/rarityGuide";
import { ON_AIR_CHANCE, ON_AIR_COPIES } from "@/lib/packs/config";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "On Air — FPL Admin",
};

/**
 * The casters' desk. Staff only, and the only page that writes
 * `on_air_casters`: who is in the pool, what art their card wears, what it
 * says, and how many of their twenty-five this season have been pulled.
 *
 * Nothing here mints. The card can only come out of a pack opened inside a
 * Live Drops window (src/lib/packs/open.ts), which is opened on the
 * schedule page — the preview below is what the NEXT copy would look like,
 * drawn through the same PlayerCard3D the shop renders.
 */
export default async function OnAirAdminPage() {
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner } = await fetchStaffTier(supabase);
  if (!isAdmin && !isOwner) redirect("/admin");

  const { data: settings } = await supabase
    .from("league_settings")
    .select("current_season")
    .eq("id", 1)
    .maybeSingle();
  // The premier season: the pool is league-wide, but copies are numbered per
  // season and the roller numbers against the PACK's season.
  const season = (settings as { current_season: string } | null)?.current_season ?? "S5";

  const desk = await fetchOnAirDesk(supabase);
  const found = await countOnAirThisSeason(supabase, season);

  const specimen = onAirCard(ON_AIR_SPECIMEN, 1, season, "Week 3 broadcast");
  const noSignal = onAirCard({ ...ON_AIR_SPECIMEN, name: "Static", champion: null, roleLabel: "Colour" }, 12, season, "Week 3 broadcast");

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-12 px-6 py-16">
      <header className="flex flex-col gap-3">
        <Link href="/admin" className="label-dash w-fit hover:text-coral">
          ← Admin
        </Link>
        <h1 className="type-display text-4xl sm:text-5xl">On Air</h1>
        <p className="max-w-3xl text-sm text-steel">
          The casters get a card of their own — a 100 in every column, in broadcast colour bars with the ON AIR lamp
          lit. The only way to pull one is to open a pack while a Live Drops window is running, which makes being in
          the room while the games run the whole of its scarcity.
        </p>
        <p className="max-w-3xl text-sm text-gold">
          What mints: only inside a Live Drops window, {oneIn(ON_AIR_CHANCE)} packs, {ON_AIR_COPIES} per caster per
          season. It never dusts, and every copy is announced to the cards channel the moment it lands. Open a window
          on the <Link href="/schedule" className="underline hover:text-coral">schedule page</Link>.
        </p>
      </header>

      <section aria-label="The pool" className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h2 className="type-display text-2xl">The pool</h2>
          <p className="max-w-3xl text-sm text-steel">
            Every profile an owner has marked <b className="text-white">broadcaster</b> on{" "}
            <Link href="/admin" className="underline hover:text-coral">
              /admin
            </Link>
            . A broadcaster with no row here is already in the pool, on the defaults — saving below is how they stop
            being a caster with no champion. Season <b className="text-white">{season}</b>.
          </p>
        </div>

        {desk.length === 0 ? (
          <p data-testid="on-air-empty" className="card-brand p-5 text-sm text-steel">
            Nobody is marked broadcaster yet, so nothing can print. An owner grants it on{" "}
            <Link href="/admin" className="underline hover:text-coral">
              /admin
            </Link>
            , in the staff panel.
          </p>
        ) : (
          desk.map((row) => {
            const minted = found[row.caster.profileId] ?? 0;
            return (
              <div
                key={row.caster.profileId}
                data-testid={`on-air-caster-${row.caster.profileId}`}
                className="flex flex-col gap-4 lg:flex-row lg:items-start"
              >
                <div className="flex w-[300px] shrink-0 flex-col items-center gap-2">
                  {/* Exactly as it would mint next: the same builder the
                      roller uses, numbered after what this caster has
                      already printed this season. */}
                  <PlayerCard3D card={onAirCard(row.caster, Math.min(minted + 1, ON_AIR_COPIES), season, "Preview")} interactive />
                  <span className="text-xs text-steel">the next copy, as it would print</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <div className="flex flex-wrap items-baseline gap-3">
                    <h3 className="type-display text-xl">{row.caster.name}</h3>
                    <span className="text-xs uppercase tracking-[0.16em] text-steel">
                      {minted} of {ON_AIR_COPIES} minted this season
                    </span>
                    {row.active ? null : <span className="text-xs font-semibold uppercase tracking-wide text-red-400">Out of the pool</span>}
                    {row.hasRow ? null : <span className="text-xs text-steel">no settings saved yet — on the defaults</span>}
                  </div>
                  <OnAirCasterForm
                    profileId={row.caster.profileId}
                    name={row.caster.name}
                    champion={row.caster.champion}
                    skin={row.caster.skin}
                    roleLabel={row.caster.roleLabel}
                    tagline={row.caster.tagline}
                    active={row.active}
                  />
                </div>
              </div>
            );
          })
        )}
      </section>

      <section aria-label="The look" className="flex flex-col gap-4">
        <h2 className="type-display text-2xl">The look</h2>
        <p className="max-w-3xl text-sm text-steel">
          The specimen, so the treatment can be judged before anybody has set anything: colour bars bleeding in from
          the right, the lamp under the tier row, the waveform along the foot and the REC dot in the corner — and, for
          a caster with no champion, the full test pattern where the photograph would be.
        </p>
        <div className="flex flex-wrap gap-8">
          <div data-testid="on-air-specimen" className="flex w-[300px] flex-col items-center gap-2">
            <PlayerCard3D card={specimen} interactive />
            <span className="text-xs text-steel">With art — the caster&apos;s chosen champion and skin</span>
          </div>
          <div data-testid="on-air-specimen-no-signal" className="flex w-[300px] flex-col items-center gap-2">
            <PlayerCard3D card={noSignal} interactive />
            <span className="text-xs text-steel">No champion set — no signal, which is the print, not a failure</span>
          </div>
        </div>
      </section>
    </main>
  );
}

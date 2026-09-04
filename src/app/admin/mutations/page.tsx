import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchAllCardSeasons, fetchCardEditionWeeks, fetchCurrentWeekCards, fetchEditionCards } from "@/lib/cards/queries";
import { MUTATIONS, PROPOSED_RUNS, mutationOverlay, type Mutation } from "@/lib/cards/mutations";
import { EXPEDITION_TIERS } from "@/lib/expeditions/config";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Expedition mutations — FPL Admin",
};

const TONE_CLASS: Record<Mutation["tone"], string> = {
  boon: "border-mint/50 text-mint",
  bane: "border-red-400/60 text-red-300",
  mixed: "border-gold/50 text-gold",
};
const TONE_LABEL: Record<Mutation["tone"], string> = { boon: "Boon", bane: "Bane", mixed: "Double-edged" };
const RISK_LABEL: Record<(typeof PROPOSED_RUNS)[number]["risk"], string> = {
  none: "no risk",
  wounded: "cards can come home wounded",
  lost: "cards can be lost (rescue or ransom within a week)",
  dead: "cards can die",
};

const mutationProps = mutationOverlay;

/**
 * PREVIEW ONLY. Staff only. The expedition redesign — forks, risk, and
 * the mutations a card can come home with — drawn on REAL cards from the
 * current edition through the same PlayerCard3D the shop renders. The
 * treatments are CSS that no minted copy can reach (`mutation` is a prop
 * only this page passes), so nothing here can leak onto a shelf, and
 * nothing is written.
 */
export default async function MutationsPreviewPage() {
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner } = await fetchStaffTier(supabase);
  if (!isAdmin && !isOwner) redirect("/admin");

  const service = createBettingServiceClient();
  const seasons = await fetchAllCardSeasons(service);
  const season = seasons.find((entry) => entry.league === "premier")?.season ?? seasons[0]?.season ?? null;
  const weeks = season ? await fetchCardEditionWeeks(service, season) : [];
  const cards = season
    ? weeks[0]
      ? await fetchEditionCards(service, season, weeks[0])
      : await fetchCurrentWeekCards(service, season)
    : [];
  const featured = [...cards].sort((a, b) => b.overall - a.overall).slice(0, 3);
  const hero = featured[0] ?? null;

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-12 px-6 py-16">
      <header className="flex flex-col gap-3">
        <Link href="/admin" className="label-dash w-fit hover:text-coral">
          ← Admin
        </Link>
        <span className="label-dash text-gold">Staff · design table</span>
        <h1 className="type-display text-4xl sm:text-5xl">Expeditions with teeth</h1>
        <p className="max-w-3xl text-sm text-steel">
          Today a run is fire-and-forget: three cards, a lock, dollars and a mark. The proposal makes a run a
          short story with forks that ping you, real risk on the deeper routes, and cards that come home
          changed for good. The five mutations below are drawn on real cards from{" "}
          {weeks[0] ? `the ${weeks[0]} edition` : "the live build"} by the same component the shop uses.
          Hover a card.
        </p>
        <p className="max-w-3xl text-sm text-coral">
          A design table, not a game surface. Nothing on this page mints or writes anything — the routes on
          /cards/expeditions mint these for real, and the numbers each card quotes are the ones the scorers read.
        </p>
      </header>

      {hero ? (
        <section aria-label="Every mutation on one card" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline gap-3 border-b border-line pb-2">
            <h2 className="type-display text-2xl">{hero.name}, five ways home</h2>
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel">
              the same copy, as each mutation would leave it
            </span>
          </div>
          <div className="flex flex-wrap gap-6">
            <div className="flex flex-col items-center gap-2">
              <PlayerCard3D card={hero} interactive />
              <span className="text-xs text-steel">As pulled</span>
            </div>
            {MUTATIONS.map((mutation) => (
              <div key={mutation.key} className="flex flex-col items-center gap-2">
                <PlayerCard3D card={hero} interactive mutation={mutationProps(mutation)} />
                <span className="text-xs font-semibold" style={{ color: mutation.accent }}>
                  {mutation.label}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <p className="text-sm text-steel">No edition cards to draw on yet.</p>
      )}

      <section aria-labelledby="mutations" className="flex flex-col gap-4">
        <h2 id="mutations" className="type-display text-2xl">
          What each one does
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {MUTATIONS.map((mutation, index) => {
            const card = featured[(index + 1) % Math.max(featured.length, 1)] ?? hero;
            return (
              <article key={mutation.key} className="card-brand flex flex-col gap-4 p-5 sm:flex-row">
                {card ? (
                  <div className="shrink-0 self-center sm:self-start">
                    <PlayerCard3D card={card} interactive mutation={mutationProps(mutation)} />
                  </div>
                ) : null}
                <div className="flex min-w-0 flex-col gap-2 text-sm text-steel">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="type-display text-2xl" style={{ color: mutation.accent }}>
                      {mutation.label}
                    </h3>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TONE_CLASS[mutation.tone]}`}>
                      {TONE_LABEL[mutation.tone]}
                    </span>
                  </div>
                  <p className="italic text-white">“{mutation.tagline}”</p>
                  <p>
                    <strong className="text-white">The look.</strong> {mutation.look}
                  </p>
                  <p>
                    <strong className="text-white">How you get it.</strong> {mutation.source}
                  </p>
                  <p>
                    <strong className="text-white">Fantasy.</strong> {mutation.fantasy}
                  </p>
                  <p>
                    <strong className="text-white">Gauntlet.</strong> {mutation.gauntlet}
                  </p>
                  <p>
                    <strong className="text-white">Market and dust.</strong> {mutation.economy}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
        <p className="text-xs text-steel">
          One mutation per copy, permanent unless exorcised. Never on an Eclipse, a moment, a champion or a
          team plate. The card face, the market listing and the trade chip all show it.
        </p>
      </section>

      <section aria-labelledby="runs" className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="card-brand flex flex-col gap-3 p-5 text-sm text-steel">
          <h2 id="runs" className="type-display text-2xl text-white">
            The run ladder, from three to six
          </h2>
          <p>
            The three runs that exist stay as they are and gain forks. Three more give the risk somewhere to
            go: a way to get a lost card back, a way out of a bad mutation, and one route where death is
            real and the reward is the only Voidtouched card you will ever hold.
          </p>
          <ul className="flex flex-col gap-2">
            {PROPOSED_RUNS.map((run) => (
              <li key={run.label} className="flex flex-col gap-0.5 border-b border-line pb-2">
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-white">{run.label}</span>
                  <span className="text-xs text-steel">
                    {run.hours}h · {run.forks} fork{run.forks === 1 ? "" : "s"} · {RISK_LABEL[run.risk]}
                  </span>
                </span>
                <span className="text-xs text-steel/80">{run.what}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-steel">
            Today: {Object.values(EXPEDITION_TIERS).map((tier) => `${tier.label} ${tier.durationHours}h`).join(" · ")}. No forks, no risk.
          </p>
        </div>
        <div className="card-brand flex flex-col gap-3 p-5 text-sm text-steel">
          <h2 className="type-display text-2xl text-white">How a card dies</h2>
          <p>
            <strong className="text-white">A ladder, not a switch.</strong> Wounded (benched three days) on a
            Deep Raid. Lost (a week to rescue or ransom) on a Legend Hunt. Dead only on the Legendary route,
            and only after two reckless forks. Nobody loses a card to one bad roll on the run they took
            yesterday.
          </p>
          <p>
            <strong className="text-white">Four ways, not one.</strong> Reckless forks are the obvious one.
            A rescue that fails can lose a rescuer. A cursed card that goes out again has a chance of not
            coming back. And a Legend Hunt squad that is all one team can be wiped together if the
            checkpoint is ignored twice — the roster chemistry that helps you is the same thing that sinks
            you.
          </p>
          <p>
            <strong className="text-white">Consent, always.</strong> The launch screen says which cards can
            die on this route before you press go. Insurance for a fee turns lost into wounded. Silence at a
            fork always picks the safe option.
          </p>
          <p>
            <strong className="text-white">What is never at risk.</strong> Eclipses, moments, champions and
            team plates cannot go on a route that can kill. They are one of one and the economy already
            treats them that way.
          </p>
          <p>
            <strong className="text-white">Ship order.</strong> Forks, Wounded and Irradiated first. Watch
            whether people answer the pings. Lost, Rescue and the rest of the mutations second. The
            Legendary route and death last, once a card being benched has taught everyone that choices
            cost something.
          </p>
        </div>
      </section>
    </main>
  );
}

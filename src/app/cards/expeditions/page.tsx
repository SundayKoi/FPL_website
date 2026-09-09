import type { Metadata } from "next";
import { parseInventoryId } from "@/lib/cards/params";
import Link from "next/link";
import CardsGate from "@/components/cards/CardsGate";
import CardsPageHeader, { cardsEyebrow } from "@/components/cards/CardsPageHeader";
import ExpeditionBoard from "@/components/cards/ExpeditionBoard";
import { bettingAccess } from "@/lib/betting/access";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchCardSeason, type CardLeague } from "@/lib/cards/queries";
import {
  fetchConvoyViews,
  fetchDeployedCopyIds,
  fetchFixturesSince,
  fetchFragments,
  fetchGraveyard,
  fetchLostHolds,
  fetchInsuredThisWeek,
  fetchPolicyUsed,
  fetchRuns,
  type ExpeditionRun,
  type Grave,
  type LostHold,
} from "@/lib/expeditions/queries";
import { nextOpponent, rosterTeam, teamsPlayingOn } from "@/lib/expeditions/matchday";
import { fetchCompanies, fetchRivalries } from "@/lib/expeditions/companyReads";
import type { Rivalry, RoadCompany } from "@/lib/expeditions/company";
import { watchWeeksOf, weatherNow, weatherOfRun } from "@/lib/expeditions/weather";
import { fetchInventory, fetchInventoryByIds, type InventoryRow } from "@/lib/packs/queries";
import { easternDateOf, mondayOf } from "@/lib/packs/week";
import { patronActive } from "@/lib/patron/flames";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Expeditions — FPL",
  description: "Send three cards out on a route with forks. Answer the forks, and find out who comes home — and what they come home as.",
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The expedition board: three cards go out, and hours later they come back
 * with betting dollars, sometimes a free pack, and rarely a mark that stays
 * on one of them forever.
 *
 * Gated on the wallet rather than the premium-role check, same as
 * /cards/packs and the Gauntlet — an expedition pays into the wallet, so
 * the wallet is the thing you need.
 *
 * The viewer is resolved READ-ONLY and deliberately NOT via getBettingUser():
 * that call runs grant_signup_bonus, which would create a wallet, credit a
 * signup bonus and re-sync username/avatar as a side effect of merely
 * loading a page — and a GET must not write. The cookie-bound client
 * answers "who is signed in", `profiles` (public read policy) answers
 * "which Discord id is that", and bettingAccess() is a Discord API read
 * with no database write at all. Exactly the shape /cards uses.
 *
 * Every collection read then goes through the service client: card_inventory
 * has no public RLS policy, and the Discord id came from the session, so
 * this page can only ever ask for the signed-in collector's shelf.
 */
export async function ExpeditionsPageView({
  league = "premier",
  send,
}: {
  league?: CardLeague;
  /** ?send=<inventory id> — start the squad with this copy. */
  send?: string;
} = {}) {
  const base = league === "academy" ? "/academy/cards" : "/cards";
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser().then(
    (result) => result,
    () => ({ data: { user: null } }),
  );
  const viewer = auth.user;

  if (!viewer) {
    return (
      <CardsGate
        section="Card expeditions"
        title="Sign in to send a squad out"
        body="Expeditions field cards from your collection and pay into your wallet — sign in with Discord to check your access."
        signIn={`${base}/expeditions`}
        browse={`${base}/browse`}
      />
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("discord_id")
    .eq("id", viewer.id)
    .maybeSingle()
    .then(
      (result) => result,
      () => ({ data: null }),
    );
  const discordId = (profile as { discord_id: string | null } | null)?.discord_id ?? null;
  // A profile with no Discord id is an account that never linked one (or
  // linked it before the column existed). That is not "no role", and it
  // must not read like it: the fix is a fresh sign-in, not a purchase.
  if (!discordId) {
    return (
      <CardsGate
        section="Card expeditions"
        reason="signed-out"
        title="Your Discord account isn't linked yet"
        body="Expeditions read your collection by your Discord id, and this account hasn't got one attached. Sign out and back in with Discord and it will."
        signIn={`${base}/expeditions`}
        browse={`${base}/browse`}
      />
    );
  }
  const allowed = (await bettingAccess(discordId)).allowed;
  if (!allowed) {
    return (
      <CardsGate
        section="Card expeditions"
        body="An expedition pays betting dollars, and only members have a wallet to pay into. The role opens it."
        browse={`${base}/browse`}
      />
    );
  }

  const service = createBettingServiceClient();
  const season = await fetchCardSeason(service, league);
  const week = mondayOf(new Date());
  const [inventory, runs, deployedIds, holds, graves, fragments, policyUsed, insuredThisWeek, wallet]: [
    InventoryRow[],
    ExpeditionRun[],
    Set<number>,
    LostHold[],
    Grave[],
    number,
    boolean,
    number,
    { patron_until?: string | null } | null,
  ] = season
    ? await Promise.all([
        fetchInventory(service, discordId, season),
        fetchRuns(service, discordId, season),
        // Season-blind on purpose: the deploy lock belongs to the CARD, so
        // a copy away on an academy run is greyed out on the premier board
        // too rather than being offered and then refused by the trigger.
        fetchDeployedCopyIds(service, discordId),
        fetchLostHolds(service, discordId),
        fetchGraveyard(service, discordId, season),
        fetchFragments(service, discordId),
        fetchPolicyUsed(service, discordId, week),
        fetchInsuredThisWeek(service, discordId, week),
        service
          .from("betting_profiles")
          .select("patron_until")
          .eq("discord_id", discordId)
          .maybeSingle()
          .then((result) => (result.data as { patron_until?: string | null } | null) ?? null, () => null),
      ])
    : [[], [], new Set<number>(), [], [], 0, false, 0, null];

  // A run must always be able to name its own cards. The season read above
  // is the collection as this page browses it, and a squad can sit outside
  // it — a copy from another season's shelf, or one past whatever the
  // collection read returned — so anything a run references and the shelf
  // didn't hand back is fetched by id and folded in. They arrive already
  // marked deployed, so they show in the strip and stay unpickable. Holds
  // are runs too, so a lost card from another season is named the same way.
  const shelved = new Set(inventory.map((copy) => copy.id));
  const offShelf = [...new Set([...runs.flatMap((run) => run.squad), ...holds.map((hold) => hold.cardId)])].filter(
    (id) => !shelved.has(id),
  );
  const copies =
    offShelf.length > 0 ? [...inventory, ...(await fetchInventoryByIds(service, discordId, offShelf))] : inventory;

  // The league's calendar: tonight's fixtures (the match-day surge the
  // brief banner and the picker point at) and, for a one-roster squad on
  // the Legendary route, who their team plays next (the rival fork). Read
  // from a day before the oldest squad in the field set out, so a run's
  // "next opponent" is the one that was next when it launched.
  const now = new Date();
  const today = easternDateOf(now);
  const active = runs.filter((run) => run.tier !== "lost" && run.claimedAt === null);
  const oldest = active.reduce((min, run) => Math.min(min, Date.parse(run.startedAt)), now.getTime());
  const copyById = new Map(copies.map((copy) => [copy.id, copy]));
  // Who else is on the road with each squad in the field (company.ts):
  // the rivals it races, decided by shine, and the graveyard's ghosts.
  // Read here with the service role — the runs and graves it needs are
  // other people's — and handed to the journal through the run.
  const [fixtures, convoys, companies, rivalries] = await Promise.all([
    fetchFixturesSince(service, new Date(oldest - DAY_MS).toISOString()),
    fetchConvoyViews(service, discordId, active),
    season
      ? fetchCompanies(
          service,
          season,
          active.map((run) => ({
            id: run.id,
            discordId,
            tier: run.tier,
            shine: run.shine,
            startedAt: run.startedAt,
            resolvesAt: run.resolvesAt,
            forks: run.forks,
            rules: run.rules,
            convoy: run.convoy,
            squadTeams: run.squad.map((id) => copyById.get(id)?.card?.teamName ?? null).filter((team): team is string => Boolean(team)),
          })),
        )
      : Promise.resolve<Record<number, RoadCompany>>({}),
    season ? fetchRivalries(service, discordId, season) : Promise.resolve<Rivalry[]>([]),
  ]);
  const playingToday = [...teamsPlayingOn(fixtures, today).values()];
  // The weather (weather.ts): this week's for the banner, and each run's
  // own — the week it launched under — for its journal and its forks.
  const watchWeeks = watchWeeksOf(fixtures);
  const weather = weatherNow(now, watchWeeks);
  const runsWithCompany = runs.map((run) => ({
    ...run,
    ...(companies[run.id] ? { company: companies[run.id] } : {}),
    weather: run.tier === "lost" ? null : (weatherOfRun(run, watchWeeks)?.key ?? null),
  }));
  const rivals: Record<number, string> = {};
  for (const run of active) {
    if (run.tier !== "legendary") continue;
    const squad = run.squad.map((id) => copyById.get(id)).filter((copy): copy is InventoryRow => Boolean(copy));
    const team = rosterTeam(squad);
    const rival = team ? nextOpponent(fixtures, team, new Date(run.startedAt)) : null;
    if (rival) rivals[run.id] = rival;
  }

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <CardsPageHeader
        eyebrow={cardsEyebrow("Play", league, season)}
        title="Expeditions"
        tabHref={`${base}/play`}
        below={
          <Link href={`${base}/expeditions/ledger`} className="mt-3 inline-block text-sm text-coral underline-offset-4 hover:underline">
            The league&apos;s ledger of the fallen and the found →
          </Link>
        }
      >
        Send three cards out on a route. The squad stops at forks and asks you what to do; push for
        more and someone can get hurt, camp and keep what you have. They come home with betting
        dollars, sometimes a pack or a map fragment — and sometimes changed for good: wounded,
        mutated, lost, or on the deepest route, dead. Every rule is on this page, and the launch
        button names which of your cards can be hurt before you press it.
      </CardsPageHeader>

      <ExpeditionBoard
        copies={copies}
        runs={runsWithCompany}
        rivalries={rivalries}
        weather={weather.key}
        deployedIds={deployedIds}
        initialPick={parseInventoryId(send)}
        base={base}
        holds={holds}
        graves={graves}
        fragments={fragments}
        patron={patronActive(wallet?.patron_until)}
        policyUsed={policyUsed}
        insuredThisWeek={insuredThisWeek}
        playingToday={playingToday}
        rivals={rivals}
        convoys={convoys}
        // Resolved server-side on the Eastern calendar the whole card
        // economy keeps, so the banner names the brief a launch is actually
        // scored against rather than whatever the reader's clock says.
        today={today}
      />
    </main>
  );
}

export default async function ExpeditionsPage({ searchParams }: { searchParams: Promise<{ send?: string }> }) {
  const { send } = await searchParams;
  return ExpeditionsPageView({ league: "premier", send });
}

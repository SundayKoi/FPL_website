import type { Metadata } from "next";
import Link from "next/link";
import CardsLeagueToggle from "@/components/cards/CardsLeagueToggle";
import ExpeditionBoard from "@/components/cards/ExpeditionBoard";
import { bettingAccess } from "@/lib/betting/access";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchCardSeason, type CardLeague } from "@/lib/cards/queries";
import { fetchDeployedCopyIds, fetchRuns, type ExpeditionRun } from "@/lib/expeditions/queries";
import { fetchInventory, fetchInventoryByIds, type InventoryRow } from "@/lib/packs/queries";
import { easternDateOf } from "@/lib/packs/week";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Card Expeditions — FPL",
  description: "Send three cards out for a few hours and collect what they bring back.",
};

const LEAGUE_LABELS: Record<CardLeague, string> = { premier: "Premier", academy: "Academy" };

/**
 * The expedition board: three cards go out, and hours later they come back
 * with betting dollars, sometimes a free pack, and rarely a mark that stays
 * on one of them forever.
 *
 * Gated on FPL Better rather than the premium card role, same as
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
export async function ExpeditionsPageView({ league = "premier" }: { league?: CardLeague } = {}) {
  const base = league === "academy" ? "/academy/cards" : "/cards";
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser().then(
    (result) => result,
    () => ({ data: { user: null } }),
  );
  const viewer = auth.user;

  if (!viewer) {
    return (
      <main className="bg-hash flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <span className="label-dash">Card expeditions</span>
        <h1 className="type-display text-3xl sm:text-4xl">Sign in to send a squad out</h1>
        <p className="max-w-md text-sm text-muted">
          Expeditions field cards from your collection and pay into your FPL Better wallet — sign in
          with Discord to check your access.
        </p>
        <Link href={`/login?redirect=${base}/expeditions`} className="btn-pill mt-2">
          Sign in with Discord
        </Link>
      </main>
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
  // No linked Discord id means no betting profile and no shelf — the same
  // dead end as failing the role check, and it reads the same to the player.
  const allowed = discordId ? (await bettingAccess(discordId)).allowed : false;

  if (!discordId || !allowed) {
    return (
      <main className="bg-hash flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <span className="label-dash">Card expeditions</span>
        <h1 className="type-display text-3xl sm:text-4xl">FPL Better members only</h1>
        <p className="max-w-md text-sm text-muted">
          An expedition pays betting dollars, and only FPL Better members have a wallet to pay into.
          Join the FPL Better role in Discord and come back to send a squad out.
        </p>
      </main>
    );
  }

  const service = createBettingServiceClient();
  const season = await fetchCardSeason(service, league);
  const [inventory, runs, deployedIds]: [InventoryRow[], ExpeditionRun[], Set<number>] = season
    ? await Promise.all([
        fetchInventory(service, discordId, season),
        fetchRuns(service, discordId, season),
        // Season-blind on purpose: the deploy lock belongs to the CARD, so
        // a copy away on an academy run is greyed out on the premier board
        // too rather than being offered and then refused by the trigger.
        fetchDeployedCopyIds(service, discordId),
      ])
    : [[], [], new Set<number>()];

  // A run must always be able to name its own cards. The season read above
  // is the collection as this page browses it, and a squad can sit outside
  // it — a copy from another season's shelf, or one past whatever the
  // collection read returned — so anything a run references and the shelf
  // didn't hand back is fetched by id and folded in. They arrive already
  // marked deployed, so they show in the strip and stay unpickable.
  const shelved = new Set(inventory.map((copy) => copy.id));
  const offShelf = [...new Set(runs.flatMap((run) => run.squad))].filter((id) => !shelved.has(id));
  const copies =
    offShelf.length > 0 ? [...inventory, ...(await fetchInventoryByIds(service, discordId, offShelf))] : inventory;

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label-dash">
            Premium · {LEAGUE_LABELS[league]} · Season {season ?? "—"}
          </span>
          <h1 className="type-display mt-2 text-4xl sm:text-5xl">Card Expeditions</h1>
          <p className="mt-3 max-w-2xl text-sm text-muted">
            Send three cards out into the field. They are away for hours, not spent — while a squad is
            out its cards can&apos;t be dusted or traded, and when the clock runs out they come home with
            betting dollars, sometimes a free pack, and occasionally a mark that one of them wears for
            the rest of its life. Brighter cards clear harder runs and are paid more for it.
          </p>
          <Link
            href={base}
            className="mt-3 inline-block text-xs text-muted underline-offset-4 hover:text-primary hover:underline"
          >
            ← Back to player cards
          </Link>
        </div>
        <CardsLeagueToggle league={league} suffix="/expeditions" />
      </header>

      <ExpeditionBoard
        copies={copies}
        runs={runs}
        deployedIds={deployedIds}
        // Resolved server-side on the Eastern calendar the whole card
        // economy keeps, so the banner names the brief a launch is actually
        // scored against rather than whatever the reader's clock says.
        today={easternDateOf(new Date())}
      />
    </main>
  );
}

export default async function ExpeditionsPage() {
  return ExpeditionsPageView({ league: "premier" });
}

import type { Metadata } from "next";
import Link from "next/link";
import CardsLeagueToggle from "@/components/cards/CardsLeagueToggle";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import { fmtPoints } from "@/lib/betting/format";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { DRAW_EMPTY_HEADLINE, DRAW_TAGLINE, fetchDrawHistory } from "@/lib/cards/draw-queries";
import { fetchCardSeason, type CardLeague } from "@/lib/cards/queries";
import { fetchBettingUsernames } from "@/lib/fantasy/queries";
import { WEEKLY_DRAW_POT } from "@/lib/packs/config";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "The Weekly Draw — FPL",
  description: "Every card copy is a raffle ticket. One card wins every week — here is every winner.",
};

const LEAGUE_LABELS: Record<CardLeague, string> = { premier: "Premier", academy: "Academy" };

/** "Week of Aug 24" — the stored week is a plain calendar date, so it is
 *  read back and printed as UTC. Letting the browser's timezone parse it
 *  would slide a chunk of the world back a day onto the wrong Sunday. */
function weekLabel(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return weekStart;
  return `Week of ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
}

/**
 * Display names for the winners. weekly_draws stores the Discord id and
 * betting_profiles has no public read policy, so the names come back
 * through the service client and only the resolved name is rendered.
 *
 * Fails soft to an empty map — including when the service client can't be
 * built at all (no SUPABASE_SERVICE_ROLE_KEY configured, which throws
 * outright). This page's subject is the cards and the weeks; a name is the
 * one thing on it that may degrade to a Discord id rather than take the
 * whole public history down.
 */
async function loadWinnerNames(discordIds: string[]): Promise<Map<string, string>> {
  if (discordIds.length === 0) return new Map();
  try {
    return await fetchBettingUsernames(createBettingServiceClient(), discordIds);
  } catch (error) {
    // Fail soft, but never silently: without this a misconfigured service
    // key is indistinguishable from a league of nameless winners.
    console.error("cards/draw: winner name lookup failed", error);
    return new Map();
  }
}

/**
 * The draw's hall of winners.
 *
 * Public on purpose, like the moment wall and the ledger: weekly_draws has
 * a public read policy for exactly this reason, and the winner has already
 * been announced in Discord by the time a row exists. Nothing private
 * reaches the page — the frozen card, the week, the pot, and a display
 * name resolved server-side.
 *
 * Premier and Academy each run their own draw (the script raffles every
 * card season), so this view is league-agnostic like every other card page:
 * one season code, chosen by the caller.
 */
export async function DrawPageView({ league = "premier" }: { league?: CardLeague } = {}) {
  const base = league === "academy" ? "/academy/cards" : "/cards";
  const supabase = await createServerSupabase();
  const season = await fetchCardSeason(supabase, league);
  const history = season ? await fetchDrawHistory(supabase, season) : [];

  const names = await loadWinnerNames(history.map((row) => row.discordId));

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label-dash">
            {LEAGUE_LABELS[league]} · Season {season ?? "—"}
          </span>
          <h1 className="type-display mt-2 text-4xl sm:text-5xl">The Weekly Draw</h1>
          <hr className="accent-rule mt-4 w-40 sm:w-56" />
          <p className="mt-3 max-w-2xl text-sm text-steel">
            {DRAW_TAGLINE} Every copy in your collection is a ticket, and the draw treats them all the
            same — a Bronze common has exactly the odds a Challenger foil does. Every Tuesday one copy
            comes up, its holder takes {fmtPoints(WEEKLY_DRAW_POT)} and a free pack, and the winning
            card is stamped with a laurel it wears forever.
          </p>
          <Link
            href={base}
            className="mt-3 inline-block text-xs text-steel underline-offset-4 hover:text-coral hover:underline"
          >
            ← Back to player cards
          </Link>
        </div>
        <CardsLeagueToggle league={league} suffix="/draw" />
      </header>

      {history.length === 0 ? (
        <p className="text-sm text-steel">{DRAW_EMPTY_HEADLINE}</p>
      ) : (
        <section aria-label="Every draw winner" className="grid gap-8 sm:grid-cols-2 xl:grid-cols-3">
          {history.map((draw) => (
            <figure key={draw.weekStart} className="flex flex-col items-center gap-3">
              {/* The frozen snapshot, laurel and all — not the living copy,
                  which may have been dusted since. */}
              <PlayerCard3D card={draw.card} interactive />
              <figcaption className="flex flex-col items-center gap-1 text-center">
                <span className="label-dash">{weekLabel(draw.weekStart)}</span>
                <span className="text-sm font-semibold text-white">
                  {names.get(draw.discordId) ?? draw.discordId}
                </span>
                <span className="text-xs text-steel">
                  {draw.card.name} · {fmtPoints(draw.pot)} and a free pack
                </span>
              </figcaption>
            </figure>
          ))}
        </section>
      )}
    </main>
  );
}

export default async function DrawPage() {
  return DrawPageView({ league: "premier" });
}

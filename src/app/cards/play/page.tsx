import type { Metadata } from "next";
import Link from "next/link";
import CardsPageHeader from "@/components/cards/CardsPageHeader";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchTicketCount } from "@/lib/cards/draw-queries";
import { playStatuses, type PlayGame, type PlayStatus, type PlayTone } from "@/lib/cards/playStatus";
import { fetchCardSeason, type CardLeague } from "@/lib/cards/queries";
import { cardsSections } from "@/lib/cards/sections";
import { readViewerDiscordId } from "@/lib/cards/viewer";
import { fetchRuns } from "@/lib/expeditions/queries";
import { fetchLineup } from "@/lib/fantasy/queries";
import { currentFantasyWeek } from "@/lib/fantasy/week";
import { currentWeek, fetchActiveGauntletRun, fetchGauntletWeekStats } from "@/lib/gauntlet/queries";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Play — FPL",
  description: "Fantasy, the Gauntlet, expeditions, and the weekly draw: everything you can do with the cards you own.",
};

const LEAGUE_LABELS: Record<CardLeague, string> = { premier: "Premier", academy: "Academy" };

/** Which game a sub-tab href is, so its status line can find it. */
function gameOf(href: string): PlayGame | null {
  const leaf = href.slice(href.lastIndexOf("/") + 1);
  if (leaf === "fantasy" || leaf === "gauntlet" || leaf === "showdown" || leaf === "expeditions" || leaf === "stats") return leaf;
  if (leaf === "draw") return "draw";
  return null;
}

const TONE: Record<PlayTone, string> = {
  open: "text-coral",
  waiting: "text-gold",
  done: "text-white",
  quiet: "text-steel",
};

/**
 * Every game's state for the viewer, in one read pass. Read-only through
 * the service client (the games' tables have no public policies) with the
 * Discord id resolved from profiles, never getBettingUser() — loading a
 * menu must not write a wallet. Fails soft to "no statuses", which renders
 * the plain menu.
 */
async function loadStatuses(league: CardLeague, discordId: string | null, season: string | null) {
  const now = new Date();
  if (!discordId || !season) {
    return playStatuses({
      now,
      fantasyLineupIn: null,
      gauntlet: league === "premier" ? { active: false, bestScore: 0, attempts: 0 } : null,
      showdown: league === "premier" ? { seated: false, openTables: 0 } : null,
      expeditions: [],
      copies: 0,
    });
  }
  try {
    const service = createBettingServiceClient();
    const [lineup, activeRun, weekStats, expeditions, copies] = await Promise.all([
      fetchLineup(service, discordId, season, currentFantasyWeek(now)),
      league === "premier" ? fetchActiveGauntletRun(service, discordId) : Promise.resolve(null),
      league === "premier" ? fetchGauntletWeekStats(service, discordId, currentWeek()) : Promise.resolve(null),
      fetchRuns(service, discordId, season),
      fetchTicketCount(service, discordId, season),
    ]);
    return playStatuses({
      now,
      fantasyLineupIn: lineup !== null,
      gauntlet: league === "premier" ? { active: activeRun !== null, bestScore: weekStats?.bestScore ?? 0, attempts: weekStats?.attempts ?? 0 } : null,
      // No tables yet: the status is the "read the rules" line until PR C.
      showdown: league === "premier" ? { seated: false, openTables: 0 } : null,
      expeditions,
      copies,
    });
  } catch (error) {
    console.error("cards: play statuses failed", error);
    return {};
  }
}

/** The Play tab's front page: the games, one line each on what they are and
 *  one on where you stand this week. No gate — it is a menu; each game
 *  checks the viewer itself. */
export async function PlayPageView({ league = "premier" }: { league?: CardLeague } = {}) {
  const base = league === "academy" ? "/academy/cards" : "/cards";
  const games = cardsSections(base).find((section) => section.key === "play")?.children ?? [];

  const supabase = await createServerSupabase();
  const [season, discordId] = await Promise.all([fetchCardSeason(supabase, league), readViewerDiscordId(supabase)]);
  const statuses: Partial<Record<PlayGame, PlayStatus>> = await loadStatuses(league, discordId, season);

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1160px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <CardsPageHeader eyebrow={`Play · ${LEAGUE_LABELS[league]}`} title="Play">
        Everything here is played with cards from your collection, and most of it pays out in betting
        dollars. Nothing you own gets used up except where a page says so.
      </CardsPageHeader>
      <ul className="grid gap-4 sm:grid-cols-2">
        {games.map((game) => {
          const status = (() => {
            const key = gameOf(game.href);
            return key ? statuses[key] : undefined;
          })();
          return (
            <li key={game.href}>
              <Link
                href={game.href}
                className="card-brand group flex h-full flex-col gap-1 p-5 transition hover:border-coral focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
              >
                <span className="type-display text-xl text-white group-hover:text-coral">{game.label} →</span>
                <span className="text-sm text-steel">{game.blurb}</span>
                {status ? <span className={`mt-2 text-xs font-semibold ${TONE[status.tone]}`}>{status.text}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

export default async function PlayPage() {
  return PlayPageView({ league: "premier" });
}

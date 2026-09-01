import type { Metadata } from "next";
import Link from "next/link";
import FantasyLeaderboard, {
  type FantasySeasonRow,
  type FantasyWeeklyRow,
} from "@/components/cards/FantasyLeaderboard";
import LineupBuilder, {
  type LineupInventoryOption,
  type LineupSelection,
} from "@/components/cards/LineupBuilder";
import { fmtPoints } from "@/lib/betting/format";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { getBettingUser } from "@/lib/betting/wallet";
import { fetchCardSeason, type CardLeague } from "@/lib/cards/queries";
import { FANTASY_ROLES, SALARY_CAP, WEEKLY_PAYOUTS, type FantasyRole } from "@/lib/fantasy/config";
import { fetchBettingUsernames, fetchLineup, fetchSeasonTotals, fetchWeekLineups } from "@/lib/fantasy/queries";
import { currentFantasyWeek, lastCompletedWeek, lockTimeOf } from "@/lib/fantasy/week";
import { fetchInventory } from "@/lib/packs/queries";

export const metadata: Metadata = {
  title: "Fantasy — FPL",
  description: "Field a weekly lineup from the cards you own and play for betting dollars.",
};

const LEAGUE_LABELS: Record<CardLeague, string> = { premier: "Premier", academy: "Academy" };

/** "Aug 24" — explicit locale + UTC, matching LineupBuilder's monthDay so
 *  the two surfaces never disagree about which Monday a week is. */
function monthDay(weekStart: string): string {
  return new Date(`${weekStart}T00:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** The weekly deadline as the league reads it — "6:00 PM EDT" — derived from
 *  LOCK_HOUR_ET rather than written out, so a tuning change moves the copy. */
function lockLabelEastern(weekStart: string): string {
  return lockTimeOf(weekStart).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function Gate({ title, body, signIn }: { title: string; body: string; signIn?: string }) {
  return (
    <main className="bg-hash flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <span className="label-dash">Fantasy</span>
      <h1 className="type-display text-3xl sm:text-4xl">{title}</h1>
      <p className="max-w-md text-sm text-steel">{body}</p>
      {signIn && (
        <Link href={`/login?redirect=${signIn}`} className="btn-pill mt-2">
          Sign in with Discord
        </Link>
      )}
    </main>
  );
}

/**
 * The fantasy layer of the card-pack economy: field one owned card per role
 * each week and get paid in betting dollars for a top-three finish.
 *
 * Gated on the betting membership rather than the cards' premium role — the
 * prizes come out of the betting wallet, so the people who can play are the
 * people who have one. Premier and Academy share this view; they differ only
 * by season code, same as every other card page.
 */
export async function FantasyPageView({ league = "premier" }: { league?: CardLeague } = {}) {
  const base = league === "academy" ? "/academy/cards" : "/cards";
  const user = await getBettingUser();
  if (!user) {
    return (
      <Gate
        title="Sign in to play fantasy"
        body="Field a weekly lineup out of the cards you own and play for betting dollars. Sign in with Discord to use the betting site."
        signIn={`${base}/fantasy`}
      />
    );
  }
  if (!user.allowed) {
    return (
      <Gate
        title="Premium members only"
        body="Fantasy lineups pay out of the betting wallet, so they're part of FPL Premium — grab the premium role in the Discord."
      />
    );
  }

  const service = createBettingServiceClient();
  const season = await fetchCardSeason(service, league);
  if (!season) {
    return (
      <Gate title="No season yet" body="Fantasy opens once a season is set up for this league." />
    );
  }

  const now = new Date();
  const week = currentFantasyWeek(now);
  const scoredWeek = lastCompletedWeek(now);

  const [inventory, myLineup, weekRows, seasonTotals] = await Promise.all([
    fetchInventory(service, user.discordId, season),
    fetchLineup(service, user.discordId, season, week),
    fetchWeekLineups(service, season, scoredWeek),
    fetchSeasonTotals(service, season),
  ]);

  const names = await fetchBettingUsernames(service, [
    ...weekRows.map((row) => row.discordId),
    ...seasonTotals.map((row) => row.discordId),
  ]);

  const options: LineupInventoryOption[] = inventory.map((row) => ({
    id: row.id,
    slug: row.slug,
    playerName: row.playerName,
    role: row.role,
    overall: row.overall,
    editionWeek: row.editionWeek,
    foil: row.foil,
  }));

  // Only re-select copies the user still owns: a saved lineup naming a card
  // that has left the collection should come back as an empty slot, not a
  // select stuck on a value with no option.
  const ownedIds = new Set(options.map((option) => option.id));
  const initialSlots: LineupSelection = { Top: null, Jungle: null, Mid: null, Bot: null, Support: null };
  for (const role of FANTASY_ROLES) {
    const slot = myLineup?.slots?.[role as FantasyRole];
    if (slot && ownedIds.has(slot.inventoryId)) initialSlots[role] = slot.inventoryId;
  }

  // Ranks belong to scored entries only — fetchWeekLineups already sorts the
  // scored ones to the front, so a running counter is the whole ranking.
  let placing = 0;
  const weekly: FantasyWeeklyRow[] = weekRows.map((row) => ({
    rank: row.score === null ? null : ++placing,
    username: names.get(row.discordId) ?? row.discordId,
    score: row.score,
    breakdown: row.breakdown,
    paidOut: row.paidOut,
    totalOverall: row.totalOverall,
  }));

  const seasonRows: FantasySeasonRow[] = seasonTotals.map((row, index) => ({
    rank: index + 1,
    username: names.get(row.discordId) ?? row.discordId,
    weeks: row.weeks,
    total: row.total,
  }));

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label-dash">
            Premium · {LEAGUE_LABELS[league]} · Season {season}
          </span>
          <h1 className="type-display mt-2 text-4xl sm:text-5xl">Fantasy</h1>
          <p className="mt-3 max-w-2xl text-sm text-steel">
            Field one card you own in every role — Top, Jungle, Mid, Bot, Support — with their combined
            OVR at or under {SALARY_CAP}. Each card scores its player&apos;s real power rating for that
            week&apos;s games, and the five add up to your total. The top three managers take{" "}
            {WEEKLY_PAYOUTS.map((amount) => fmtPoints(amount)).join(" / ")} betting dollars. Lineups lock
            Mondays at {lockLabelEastern(week)} — after that the week is played out and scored.
          </p>
          <p className="mt-2 text-sm text-steel">
            Balance <b className="font-semibold text-white">{fmtPoints(user.balance)}</b> · {options.length} card
            {options.length === 1 ? "" : "s"} in your collection.
          </p>
        </div>
      </header>

      <LineupBuilder
        league={league}
        week={week}
        lockAtIso={lockTimeOf(week).toISOString()}
        inventory={options}
        initialSlots={initialSlots}
      />

      <FantasyLeaderboard weekLabel={monthDay(scoredWeek)} weekly={weekly} season={seasonRows} />
    </main>
  );
}

export default async function FantasyPage() {
  return FantasyPageView({ league: "premier" });
}

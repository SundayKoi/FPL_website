// What a StatTrak copy counts: the pictured player's Fantasy Pts, game by
// game, for every game played while the copy is held.
//
// The same tally the stats tab prints (gamePoints in
// src/lib/stats/fantasyPoints.ts), so a card that says 1,284 agrees with
// the table next to it. Fielding does not matter — the counter is about
// the player, the way a StatTrak weapon counts kills whoever is holding
// it. Pure: the weekly drop hands in the week's raw rows and the tracked
// copies, and gets back what to credit. `through` (the last game_date
// counted, or `since` before anything has been) is what makes a re-run
// of the drop credit nothing twice; bump_stattrak enforces the same
// rule in SQL.

import { cardSlug } from "./build";
import { gamePoints, round2, type FantasyStatRow } from "@/lib/stats/fantasyPoints";

export interface TrackedCopy {
  id: number;
  slug: string;
  stattrak: { since: string; through?: string | null } | null;
}

export interface StatTrakCredit {
  id: number;
  points: number;
  /** The game_date of the last game credited — the new `through`. */
  through: string;
}

/** The instant a copy's count is caught up to. */
function countedThrough(copy: TrackedCopy): number {
  const raw = copy.stattrak?.through || copy.stattrak?.since;
  const at = raw ? new Date(raw).getTime() : Number.NaN;
  return Number.isFinite(at) ? at : Number.NEGATIVE_INFINITY;
}

/** Every credit the rows earn, one per copy that has an uncounted game. */
export function stattrakCredits(copies: TrackedCopy[], rows: FantasyStatRow[]): StatTrakCredit[] {
  // Games by the slug the card carries, oldest first.
  const bySlug = new Map<string, { at: number; iso: string; points: number }[]>();
  for (const row of rows) {
    if (!row.game_date) continue;
    const at = new Date(row.game_date).getTime();
    if (!Number.isFinite(at)) continue;
    const slug = cardSlug(row.summoner_name ?? "", row.tag ?? "");
    const list = bySlug.get(slug) ?? [];
    list.push({ at, iso: new Date(at).toISOString(), points: gamePoints(row) });
    bySlug.set(slug, list);
  }
  for (const list of bySlug.values()) list.sort((a, b) => a.at - b.at);

  const credits: StatTrakCredit[] = [];
  for (const copy of copies) {
    if (!copy.stattrak) continue;
    const games = bySlug.get(copy.slug);
    if (!games) continue;
    const from = countedThrough(copy);
    const fresh = games.filter((game) => game.at > from);
    if (fresh.length === 0) continue;
    credits.push({
      id: copy.id,
      points: round2(fresh.reduce((sum, game) => sum + game.points, 0)),
      through: fresh[fresh.length - 1].iso,
    });
  }
  return credits;
}

import "server-only";

// The Weekly Standouts as card player keys — one Card of the Week PER ROLE
// (top/jungle/mid/bot/support), from the same weekly power pipeline as the
// homepage awards. This is the one card input that is Next-coupled, so it
// lives apart from the framework-free queries.ts and gets passed into
// fetchSeasonCards by pages. Failures return an empty set: no standout is
// a cosmetic downgrade, never an error.

import { deriveWeeklyRoleStandouts, fetchHomepageRawStats } from "@/lib/home/awards";
import { cardPlayerKey } from "./build";

export async function fetchStandoutKeys(season: string): Promise<Set<string>> {
  try {
    const rows = await fetchHomepageRawStats(season);
    return new Set(deriveWeeklyRoleStandouts(rows, season).map((player) => cardPlayerKey(player.name, player.tag)));
  } catch {
    return new Set();
  }
}

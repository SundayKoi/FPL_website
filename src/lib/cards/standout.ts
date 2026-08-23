import "server-only";

// The Weekly Standout winner as a card player key — the one card input
// whose pipeline (src/lib/home/awards.ts) is Next-coupled, so it lives
// apart from the framework-free queries.ts and gets passed into
// fetchSeasonCards by pages. Failures return null: no standout is a
// cosmetic downgrade, never an error.

import { fetchHomepageAwards } from "@/lib/home/awards";
import { cardPlayerKey } from "./build";

export async function fetchStandoutKey(season: string): Promise<string | null> {
  try {
    const awards = await fetchHomepageAwards(season);
    const player = awards.playerOfWeek;
    if (!player.name || !player.tag) return null;
    return cardPlayerKey(player.name, player.tag);
  } catch {
    return null;
  }
}

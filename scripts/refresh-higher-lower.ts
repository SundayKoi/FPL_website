/**
 * Refreshes Higher or Lower candidate pools from the newest archived card
 * editions without repeating the weekly card-drop announcements, snapshots,
 * fantasy scoring, or other side effects.
 *
 * Run: npx tsx scripts/refresh-higher-lower.ts
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";
import { dailyGameDate } from "../src/lib/dailyDay";
import { refreshHigherLowerSnapshot } from "../src/lib/higher-lower/snapshot";
import { fetchAllCardSeasons } from "../src/lib/cards/queries";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function main(): Promise<void> {
  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  const puzzleDate = dailyGameDate();
  const seasons = await fetchAllCardSeasons(supabase);
  if (seasons.length === 0) throw new Error("league_settings has no seasons configured");

  const failures: string[] = [];
  for (const { league, season } of seasons) {
    try {
      const result = await refreshHigherLowerSnapshot(supabase, league, season, puzzleDate);
      console.log(
        `[${league}] Higher or Lower refreshed: date=${puzzleDate}, `
        + `weeks=${result.editionWeeks.join(",")}, candidates=${result.candidateCount}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${league}] Higher or Lower refresh failed: season=${season}, date=${puzzleDate} — ${message}`);
      failures.push(`${league} season ${season} date ${puzzleDate}: ${message}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Higher or Lower refresh incomplete: ${failures.join("; ")}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

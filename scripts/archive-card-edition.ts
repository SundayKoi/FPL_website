/**
 * Archives the CURRENT live cards as one edition week, and nothing else.
 *
 * The weekly drop already does this — but it also grades fantasy, pays it
 * out, refreshes the movement baselines and posts to Discord, which makes
 * it far too blunt an instrument for "capture the cards as they stand
 * right now".
 *
 * Why that matters: cards are recomputed from season-to-DATE stats on every
 * request, so "the cards as they stood after week N" only exists in the
 * window between week N's ingest and week N+1's. Once the next ingest
 * lands, that version is gone — there is no history to rebuild it from
 * (card_rating_history keeps overall and tier, not the whole card). This
 * script is the escape hatch for capturing a week before its window shuts.
 *
 * Run: npx tsx scripts/archive-card-edition.ts [YYYY-MM-DD]
 * The week defaults to the current Eastern-calendar Monday. Pass one
 * explicitly to stamp the live cards as a DIFFERENT week — which is the
 * whole point when you are catching up a week that was never archived.
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Re-running a week
 * overwrites it rather than duplicating it.
 */
import { createClient } from "@supabase/supabase-js";
import { fetchAllCardSeasons, fetchSeasonCards } from "../src/lib/cards/queries";
import { archiveEdition } from "../src/lib/cards/editions";
import { mondayOf } from "../src/lib/packs/week";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function main(): Promise<void> {
  // argv first, then the workflow input — an empty string from a
  // workflow_dispatch with the field left blank must fall through to the
  // default rather than being read as a week.
  const requested = (process.argv[2] || process.env.EDITION_WEEK || "").trim();
  if (requested && !/^\d{4}-\d{2}-\d{2}$/.test(requested)) {
    throw new Error(`Edition week must be YYYY-MM-DD, got "${requested}"`);
  }
  const week = requested || mondayOf(new Date());

  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  const seasons = await fetchAllCardSeasons(supabase);
  if (seasons.length === 0) throw new Error("No seasons are configured in league_settings.");

  // One timestamp for the whole run: both leagues' rows should agree on
  // when this edition was taken.
  const takenAt = new Date().toISOString();
  let archived = 0;
  for (const { league, season } of seasons) {
    const cards = await fetchSeasonCards(supabase, season);
    if (cards.length === 0) {
      console.log(`[${league}] Season ${season} has no cards yet — nothing to archive.`);
      continue;
    }
    const error = await archiveEdition(supabase, season, week, cards, takenAt);
    // Fatal here, unlike in the drop: archiving is the ONLY thing this
    // script does, so a failure has to be visible and has to fail the job.
    if (error) throw new Error(`[${league}] Could not archive season ${season}: ${error}`);
    console.log(`[${league}] Archived ${cards.length} cards of season ${season} as the ${week} edition.`);
    archived += cards.length;
  }
  console.log(`Done — ${archived} cards stamped as the ${week} edition.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

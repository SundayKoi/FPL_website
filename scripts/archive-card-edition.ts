/**
 * Archives ONE week as a card edition, and nothing else.
 *
 * The weekly drop already does this — but it also grades fantasy, pays it
 * out, refreshes the movement baselines and posts to Discord, which makes
 * it far too blunt an instrument for "just capture that week".
 *
 * Same rating basis as the drop's archive, deliberately: fetchWeekCards
 * rates each player on the requested week's games against that week's
 * cohort, so an edition minted here is indistinguishable from one the drop
 * minted. (This used to archive the season-to-date cards, which meant a
 * catch-up run stamped an edition on a different basis from every other
 * one.) Because the week's rating is rebuilt from raw_stats rather than
 * from a live snapshot, ANY past week can be reconstructed exactly — there
 * is no window that shuts, and a week the drop missed can be filled in
 * whenever someone notices.
 *
 * Run: npx tsx scripts/archive-card-edition.ts [YYYY-MM-DD]
 * The week defaults to the current Eastern-calendar Monday. Pass one
 * explicitly to archive a DIFFERENT week — which is the whole point when
 * you are catching up a week that was never archived.
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Re-running a week
 * overwrites it rather than duplicating it.
 */
import { createClient } from "@supabase/supabase-js";
import { fetchAllCardSeasons, fetchWeekCards } from "../src/lib/cards/queries";
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
  // Now that the cards are rated on the week itself, a non-Monday would
  // match no games at all and archive nothing — say so instead of quietly
  // doing nothing. (Noon UTC is mid-morning ET, safely inside the day.)
  if (week !== mondayOf(new Date(`${week}T12:00:00Z`))) {
    throw new Error(`Edition week must be a Monday (Eastern) in YYYY-MM-DD form; got "${week}"`);
  }

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
    // The requested week's cards, on exactly the basis the drop archives.
    const cards = await fetchWeekCards(supabase, season, week);
    if (cards.length === 0) {
      console.log(`[${league}] Season ${season} played no games in the week of ${week} — nothing to archive.`);
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

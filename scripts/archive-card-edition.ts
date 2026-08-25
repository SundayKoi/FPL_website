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
 * Run: npx tsx scripts/archive-card-edition.ts [YYYY-MM-DD | all]
 * The week defaults to the current Eastern-calendar Monday. Pass one
 * explicitly to archive a DIFFERENT week — which is the whole point when
 * you are catching up a week that was never archived.
 *
 * Pass `all` to REBUILD every week already in the archive.
 *
 * That mode exists because an edition is a frozen snapshot of the card
 * json, and packs mint from the archive rather than from the live cards.
 * So when the rating formula changes, the site immediately shows the new
 * overalls — and every pack keeps handing out the old ones, because the
 * archived json still holds numbers the previous formula produced. Nothing
 * re-derives an edition on its own; the drop only ever writes the week it
 * runs in. `all` is what closes that gap, and it is what you want after
 * ANY change to src/lib/cards/build.ts.
 *
 * It is safe to re-run: every week is rebuilt from that week's raw_stats
 * against that week's cohort, so a rebuild is the same computation the
 * drop did, only with today's formula. Cards people already PULLED are not
 * touched — those are frozen in card_inventory and stay exactly as pulled.
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Re-running a week
 * overwrites it rather than duplicating it.
 */
import { createClient } from "@supabase/supabase-js";
import { fetchAllCardSeasons, fetchCardEditionWeeks, fetchWeekCards } from "../src/lib/cards/queries";
import { ALL_WEEKS, archiveEdition, weeksToArchive } from "../src/lib/cards/editions";
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
  const requested = (process.argv[2] || process.env.EDITION_WEEK || "").trim().toLowerCase();
  if (requested && requested !== ALL_WEEKS && !/^\d{4}-\d{2}-\d{2}$/.test(requested)) {
    throw new Error(`Edition week must be YYYY-MM-DD or "${ALL_WEEKS}", got "${requested}"`);
  }
  // Now that the cards are rated on the week itself, a non-Monday would
  // match no games at all and archive nothing — say so instead of quietly
  // doing nothing. (Noon UTC is mid-morning ET, safely inside the day.)
  // Only checked for an explicit single week: the weeks `all` sweeps come
  // out of the archive, which the drop already stamped on Mondays.
  if (requested && requested !== ALL_WEEKS && requested !== mondayOf(new Date(`${requested}T12:00:00Z`))) {
    throw new Error(`Edition week must be a Monday (Eastern) in YYYY-MM-DD form; got "${requested}"`);
  }

  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  const seasons = await fetchAllCardSeasons(supabase);
  if (seasons.length === 0) throw new Error("No seasons are configured in league_settings.");

  const currentWeek = mondayOf(new Date());
  // One timestamp for the whole run: both leagues' rows should agree on
  // when this edition was taken.
  const takenAt = new Date().toISOString();
  let archived = 0;
  for (const { league, season } of seasons) {
    // Per season, because two leagues do not necessarily have the same
    // weeks archived.
    const weeks = weeksToArchive(
      requested,
      requested === ALL_WEEKS ? await fetchCardEditionWeeks(supabase, season) : [],
      currentWeek,
    );
    if (requested === ALL_WEEKS) {
      console.log(`[${league}] Rebuilding ${weeks.length} week(s) of season ${season} with the current formula.`);
    }

    for (const week of weeks) {
      // The requested week's cards, on exactly the basis the drop archives.
      const cards = await fetchWeekCards(supabase, season, week);
      if (cards.length === 0) {
        // In `all` mode this leaves the existing rows in place rather than
        // deleting them. A week whose games have since been re-ingested
        // under different dates is a data question, not something a
        // rebuild should silently answer by emptying the edition.
        console.log(`[${league}] Season ${season} played no games in the week of ${week} — nothing to archive.`);
        continue;
      }
      const error = await archiveEdition(supabase, season, week, cards, takenAt);
      // Fatal here, unlike in the drop: archiving is the ONLY thing this
      // script does, so a failure has to be visible and has to fail the job.
      if (error) throw new Error(`[${league}] Could not archive season ${season} week ${week}: ${error}`);
      console.log(`[${league}] Archived ${cards.length} cards of season ${season} as the ${week} edition.`);
      archived += cards.length;
    }
  }
  console.log(
    requested === ALL_WEEKS
      ? `Done — ${archived} cards restamped across every archived week.`
      : `Done — ${archived} cards stamped as the ${requested || currentWeek} edition.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

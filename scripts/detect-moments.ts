/**
 * Mints the week's moment cards.
 *
 * Reads the week's raw_stats, finds every performance that clears a
 * trigger, then mints only the rarest few — see src/lib/cards/moments.ts
 * for the three brakes on volume and why the cap is the one that matters.
 *
 * Run: npx tsx scripts/detect-moments.ts [YYYY-MM-DD]
 * The week defaults to the LAST COMPLETED one, since this is meant to run
 * after the week's games are in. Pass a Monday to re-examine that week.
 *
 * Idempotent: re-running a week re-selects the same winners and the insert
 * no-ops on card_moments' unique index, so it is safe to run twice or to
 * re-run after a late ingest. It will, however, top a week up — if the cap
 * was not reached the first time and more games land later, the remaining
 * slots can still fill.
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. MOMENTS_DRY_RUN=true
 * reports what it would mint and writes nothing.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cardSlug } from "../src/lib/cards/build";
import {
  MOMENTS_PER_WEEK,
  findMomentCandidates,
  selectMoments,
  type MomentStatRow,
} from "../src/lib/cards/moments";
import { fetchAllCardSeasons, type CardLeague } from "../src/lib/cards/queries";
import { mondayOf } from "../src/lib/packs/week";

const MOMENT_COLUMNS = [
  "match_id",
  "season",
  "game_date",
  "summoner_name",
  "tag",
  "team_name",
  "champion",
  "role",
  "win",
  "kills",
  "deaths",
  "assists",
  "solo_kills",
  "penta_kills",
  "quadra_kills",
  "largest_killing_spree",
  "kill_participation_pct",
  "damage_share_pct",
  "objectives_stolen",
  "largest_critical_strike",
  "bounty_gold",
  "nexus_kills",
  "solo_turrets_late_game",
  "effective_heal_and_shield",
  "max_cs_advantage_on_lane_opponent",
  "max_level_lead_on_lane_opponent",
  "damage_mitigated",
  "on_my_way_pings",
  "game_duration_min",
].join(", ");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** The Monday before this one — the last week whose games are all played. */
function lastCompletedMonday(now: Date): string {
  const thisMonday = mondayOf(now);
  const previous = new Date(`${thisMonday}T12:00:00.000Z`);
  previous.setUTCDate(previous.getUTCDate() - 7);
  return previous.toISOString().slice(0, 10);
}

async function mintForSeason(
  supabase: SupabaseClient,
  league: CardLeague,
  season: string,
  week: string,
  dryRun: boolean,
): Promise<number> {
  // The week runs Monday 00:00 ET through the following Monday. game_date
  // is a timestamp, so bound it rather than deriving a week column.
  const start = `${week}T00:00:00Z`;
  const endDate = new Date(`${week}T12:00:00.000Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 7);
  const end = `${endDate.toISOString().slice(0, 10)}T00:00:00Z`;

  const { data, error } = await supabase
    .from("raw_stats")
    .select(MOMENT_COLUMNS)
    .eq("season", season)
    .gte("game_date", start)
    .lt("game_date", end);
  if (error) throw new Error(`[${league}] Could not read ${season}'s games: ${error.message}`);

  const rows = (data as unknown as MomentStatRow[]) ?? [];
  if (rows.length === 0) {
    console.log(`[${league}] No ${season} games in the week of ${week}.`);
    return 0;
  }

  // Already minted this week — the cap counts what exists, not what this
  // run found, so a re-run after a late ingest tops up rather than doubling.
  const { data: existing, error: existingError } = await supabase
    .from("card_moments")
    .select("slug")
    .eq("season", season)
    .eq("week_start", week);
  if (existingError) {
    throw new Error(`[${league}] Could not read existing moments (migration applied?): ${existingError.message}`);
  }
  const minted = (existing as { slug: string }[]) ?? [];
  const remaining = MOMENTS_PER_WEEK - minted.length;
  if (remaining <= 0) {
    console.log(`[${league}] ${season} already has its ${minted.length} moment(s) for ${week}.`);
    return 0;
  }

  const alreadyHeld = new Set(minted.map((entry) => entry.slug));
  const candidates = findMomentCandidates(rows, cardSlug).filter(
    (candidate) => !alreadyHeld.has(candidate.slug),
  );
  const rowsBySlug = new Map(
    rows
      .filter((row) => row.match_id && row.summoner_name && row.tag)
      .map((row) => [`${row.match_id}:${cardSlug(row.summoner_name!, row.tag!)}`, row] as const),
  );
  const picked = selectMoments(candidates, rowsBySlug, remaining);

  console.log(
    `[${league}] ${season} week of ${week}: ${rows.length} games, ${candidates.length} qualifying, minting ${picked.length}.`,
  );
  for (const moment of picked) {
    console.log(`  ${moment.title} — ${moment.summonerName} (${moment.champion ?? "?"}): ${moment.headline}`);
  }
  // Say what was left on the table rather than letting a silent cap read as
  // "that is everything that happened".
  if (candidates.length > picked.length) {
    console.log(`  (${candidates.length - picked.length} other qualifying performance(s) did not make the cut)`);
  }
  if (dryRun || picked.length === 0) return 0;

  const { error: insertError } = await supabase.from("card_moments").insert(
    picked.map((moment) => ({
      season: moment.season,
      week_start: week,
      match_id: moment.matchId,
      slug: moment.slug,
      summoner_name: moment.summonerName,
      tag: moment.tag,
      team_name: moment.teamName,
      champion: moment.champion,
      role: moment.role,
      trigger_key: moment.triggerKey,
      title: moment.title,
      headline: moment.headline,
      rarity: moment.rarity,
      game_date: moment.gameDate,
      opponent: moment.opponent,
      duration_min: moment.durationMin,
    })),
  );
  if (insertError) throw new Error(`[${league}] Could not mint: ${insertError.message}`);
  return picked.length;
}

async function main(): Promise<void> {
  const requested = (process.argv[2] || process.env.MOMENT_WEEK || "").trim();
  if (requested && !/^\d{4}-\d{2}-\d{2}$/.test(requested)) {
    throw new Error(`Week must be YYYY-MM-DD, got "${requested}"`);
  }
  const week = requested || lastCompletedMonday(new Date());
  const dryRun = (process.env.MOMENTS_DRY_RUN ?? "").toLowerCase() === "true";

  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  const seasons = await fetchAllCardSeasons(supabase);
  if (seasons.length === 0) throw new Error("No seasons are configured in league_settings.");

  let total = 0;
  for (const { league, season } of seasons) {
    total += await mintForSeason(supabase, league, season, week, dryRun);
  }
  console.log(dryRun ? `Dry run — would have minted ${total}.` : `Done — minted ${total} moment card(s) for ${week}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

/**
 * The Weekly Draw: one card copy per season wins the week. Calls the
 * run_weekly_draw RPC (idempotent — reruns are no-ops) for every card
 * season and posts each winner to the cards Discord webhook.
 *
 * Run: npx tsx scripts/weekly-draw.ts
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY; DISCORD_CARDS_WEBHOOK_URL
 * optional (the draw still records, pays and comps without it). DRAW_WEEK
 * (YYYY-MM-DD, a Monday) overrides the default: the most recent completed
 * week.
 *
 * Scheduled by .github/workflows/weekly-draw.yml Tuesdays after the card
 * drop, so the draw covers a finished week of pulls.
 */
import { createClient } from "@supabase/supabase-js";
import { fetchAllCardSeasons } from "../src/lib/cards/queries";
import { WEEKLY_DRAW_POT } from "../src/lib/packs/config";
import { lastCompletedWeekMonday, mondayOf } from "../src/lib/packs/week";

/** announce.ts's GOLD, restated: that module is `server-only` and throws
 *  the moment a plain node script imports it, so scripts post their own
 *  embeds (the weekly-card-drop.ts precedent). */
const GOLD = 0xe8c14b;

interface DrawRow {
  copy_id: number;
  discord_id: string;
  already: boolean;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function postEmbed(webhookUrl: string, title: string, description: string): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [{ title, description: description.slice(0, 4000), color: GOLD }] }),
  });
  if (!response.ok) {
    throw new Error(`Discord webhook failed: HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
}

async function main(): Promise<void> {
  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  const webhookUrl = process.env.DISCORD_CARDS_WEBHOOK_URL ?? null;

  // DRAW_WEEK (manual runs) draws a specific Monday — for a week the cron
  // missed. Idempotency makes re-runs safe either way, but a non-Monday
  // would open a second, off-grid week nothing else can address.
  const weekOverride = process.env.DRAW_WEEK?.trim() || null;
  if (weekOverride && weekOverride !== mondayOf(new Date(`${weekOverride}T12:00:00Z`))) {
    throw new Error(`DRAW_WEEK must be a Monday in YYYY-MM-DD form; got "${weekOverride}"`);
  }
  const week = weekOverride ?? lastCompletedWeekMonday(new Date());

  const seasons = await fetchAllCardSeasons(supabase);
  if (seasons.length === 0) throw new Error("league_settings has no seasons configured");

  for (const { league, season } of seasons) {
    const { data, error } = await supabase.rpc("run_weekly_draw", {
      p_season: season,
      p_week: week,
      p_pot: WEEKLY_DRAW_POT,
    });
    if (error) throw new Error(`draw failed for ${season}: ${error.message}`);
    const row = (data as DrawRow[] | null)?.[0];
    if (!row) {
      console.log(`[${league}] ${season}: no cards yet — no draw for the week of ${week}.`);
      continue;
    }
    if (row.already) {
      console.log(`[${league}] ${season} week ${week}: already drawn — ${row.discord_id} holds copy ${row.copy_id}.`);
      continue;
    }
    console.log(`[${league}] ${season} week ${week}: ${row.discord_id} wins with copy ${row.copy_id}.`);

    if (!webhookUrl) {
      console.log(`[${league}] DISCORD_CARDS_WEBHOOK_URL not set — skipping the post.`);
      continue;
    }
    // The frozen snapshot the RPC just wrote is the card as it was won
    // (laurel and all) — the live copy could be melted a minute from now.
    const { data: drawRow } = await supabase
      .from("weekly_draws")
      .select("card")
      .eq("season", season)
      .eq("week_start", week)
      .maybeSingle();
    const card = (drawRow as { card?: { name?: string } } | null)?.card;
    await postEmbed(
      webhookUrl,
      "🎟️ The Weekly Draw",
      `**${card?.name ?? "A card"}** came up — held by <@${row.discord_id}>. ` +
        `**${WEEKLY_DRAW_POT}** betting dollars and a free pack.\n` +
        `Every copy is a ticket. One card wins every week — is it yours?`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

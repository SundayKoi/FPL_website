/**
 * Weekly card drop: posts each league's player-card movers to Discord,
 * refreshes the card_snapshots baselines that movement is measured against,
 * archives the week as a frozen card edition, and grades + pays out the
 * week's fantasy lineups. Premier and Academy run back to back — they share
 * every table, separated by season code, so each gets its own embeds.
 *
 * Note the two rating bases inside processSeason: everything the site reads
 * live (movers, snapshots, rating history) is season-to-date, while the
 * archived edition alone is rated on that week's games. They are not
 * interchangeable — see the comment there before merging the two reads.
 *
 * Run: npx tsx scripts/weekly-card-drop.ts
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY; DISCORD_CARDS_WEBHOOK_URL
 * is optional — without it the snapshots still refresh (first run seeds
 * the baseline silently), the posts are just skipped. SITE_ORIGIN
 * (optional) turns names into card links. SHOWCASE=true (manual workflow
 * runs) posts the current collection even with no movement.
 *
 * Scheduled by .github/workflows/weekly-card-drop.yml after Monday night's
 * games have been ingested, mirroring the weekly-brief jobs.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchAllCardSeasons, fetchSeasonCards, fetchWeekCards, type CardLeague } from "../src/lib/cards/queries";
import type { PlayerCardData } from "../src/lib/cards/build";
import { archiveEdition } from "../src/lib/cards/editions";
import { planPayouts } from "../src/lib/fantasy/payouts";
import { fetchBettingUsernames, fetchWeekLineups, type FantasyLineupRow } from "../src/lib/fantasy/queries";
import { scoreLineup, weeklyScoresBySlug } from "../src/lib/fantasy/scoring";
import { lastCompletedWeek } from "../src/lib/fantasy/week";
import { mondayOf } from "../src/lib/packs/week";
import { WEEKLY_STAT_COLUMNS, type WeeklyRawStatRow } from "../src/lib/stats/weekly";

interface SnapshotRow {
  slug: string;
  overall: number;
  tier: string;
}

const LEAGUE_LABELS: Record<CardLeague, string> = { premier: "Premier", academy: "Academy" };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function moverLine(card: PlayerCardData, previous: SnapshotRow, origin: string | null): string {
  const delta = card.overall - previous.overall;
  const arrow = delta > 0 ? "▲" : "▼";
  const name = origin ? `[${card.name}](${origin}/card/${card.slug})` : `**${card.name}**`;
  const tierNote = previous.tier !== card.tier.label ? ` · ${previous.tier.toUpperCase()} → ${card.tier.label.toUpperCase()}` : "";
  return `${name} ${previous.overall} → ${card.overall} (${arrow}${Math.abs(delta)})${tierNote}`;
}

async function postEmbed(webhookUrl: string, title: string, description: string, footer: string): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{ title, description: description.slice(0, 4000), color: 0xf5b62e, footer: { text: footer } }],
    }),
  });
  if (!response.ok) {
    throw new Error(`Discord webhook failed: HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
}

async function processSeason(
  supabase: SupabaseClient,
  league: CardLeague,
  season: string,
  webhookUrl: string | null,
  origin: string | null,
): Promise<void> {
  const label = LEAGUE_LABELS[league];
  const hubPath = league === "academy" ? "/academy/cards" : "/cards";
  const footer = origin ? `${origin}${hubPath}` : `FPL ${label.toLowerCase()} player cards`;

  // Computed up front (was previously derived further down, after the card
  // read) so the archive read below can be scoped to this week instead of
  // the whole season.
  const editionWeek = mondayOf(new Date());

  // TWO rating bases, on purpose — DO NOT collapse them back into one:
  //
  //  * `cards` is season-to-DATE, and it is what the site itself shows. The
  //    movers post compares it to card_snapshots (also season-to-date), and
  //    card_rating_history feeds the SeasonJourney strip on /card/[slug],
  //    which appends today's live season OVR as the arc's final point.
  //    Weekly numbers there would turn the season arc into a sawtooth
  //    ending on an unrelated season rating.
  //  * `editionCards` is that ONE WEEK alone, and only the archive takes it:
  //    an edition is a snapshot of how people played that week, which is
  //    what a pack bought for that week mints from.
  const cards = await fetchSeasonCards(supabase, season);
  console.log(`[${label}] Built ${cards.length} cards for season ${season}.`);
  if (cards.length === 0) {
    console.log(`[${label}] No cards — skipping.`);
    return;
  }

  const { data: snapshotRows, error: snapshotError } = await supabase
    .from("card_snapshots")
    .select("slug, overall, tier")
    .eq("season", season);
  if (snapshotError) throw snapshotError;
  const snapshots = new Map(((snapshotRows as SnapshotRow[]) ?? []).map((row) => [row.slug, row]));

  const movers = cards
    .map((card) => ({ card, previous: snapshots.get(card.slug) ?? null }))
    .filter((entry): entry is { card: PlayerCardData; previous: SnapshotRow } =>
      entry.previous !== null && entry.previous.overall !== entry.card.overall)
    .sort((a, b) => Math.abs(b.card.overall - b.previous.overall) - Math.abs(a.card.overall - a.previous.overall));
  const tierUps = movers.filter(
    ({ card, previous }) => card.overall > previous.overall && previous.tier !== card.tier.label,
  );
  const newcomers = cards.filter((card) => !snapshots.has(card.slug));

  // Manual runs (workflow_dispatch) can force a showcase post so the
  // webhook can be seen working without waiting a week for movement; a
  // fresh baseline (true first run) debuts the collection the same way.
  const showcase = process.env.SHOWCASE === "true" || snapshots.size === 0;

  if (!webhookUrl) {
    console.log(`[${label}] DISCORD_CARDS_WEBHOOK_URL not set — skipping the post.`);
  } else if ((movers.length === 0 && newcomers.length === 0) || showcase) {
    if (!showcase) {
      console.log(`[${label}] No card movement since the last drop — nothing to post.`);
    } else {
      const top = cards.slice(0, 8);
      const tierCounts = new Map<string, number>();
      for (const card of cards) tierCounts.set(card.tier.label, (tierCounts.get(card.tier.label) ?? 0) + 1);
      const lines = [
        "**Top of the collection**",
        ...top.map((card) => {
          const name = origin ? `[${card.name}](${origin}/card/${card.slug})` : `**${card.name}**`;
          return `${name} — ${card.overall} OVR ${card.tier.label} · ${card.archetype}`;
        }),
        "",
        [...tierCounts.entries()].map(([tier, count]) => `${tier}: ${count}`).join(" · "),
      ];
      await postEmbed(webhookUrl, `🃏 ${label} card collection — Season ${season}`, lines.join("\n"), footer);
      console.log(`[${label}] Posted the collection showcase (${cards.length} cards).`);
    }
  } else {
    const lines: string[] = [];
    if (tierUps.length > 0) {
      lines.push("**Tier ups** 🎉", ...tierUps.slice(0, 5).map(({ card, previous }) => moverLine(card, previous, origin)), "");
    }
    const biggest = movers.filter((entry) => !tierUps.includes(entry)).slice(0, 8);
    if (biggest.length > 0) {
      lines.push("**Biggest movers**", ...biggest.map(({ card, previous }) => moverLine(card, previous, origin)));
    }
    if (newcomers.length > 0) {
      lines.push("", `**New cards**: ${newcomers.map((card) => `${card.name} (${card.overall})`).join(", ")}`);
    }
    await postEmbed(webhookUrl, `📈 ${label} weekly card drop — Season ${season}`, lines.join("\n"), footer);
    console.log(`[${label}] Posted: ${tierUps.length} tier ups, ${movers.length} movers, ${newcomers.length} new cards.`);
  }

  const takenAt = new Date().toISOString();

  // Archive the WEEK's cards — rated on this week's games against this
  // week's cohort — so a pack bought for this week can mint them again
  // forever. This is the only consumer of the weekly basis; everything
  // else in this function stays on `cards` (see the note above).
  const editionCards = await fetchWeekCards(supabase, season, editionWeek);
  if (editionCards.length === 0) {
    console.log(`[${label}] No games in the week of ${editionWeek} — no edition to archive.`);
  } else {
    // Tolerated failure: an environment without the card_editions migration
    // still gets its snapshot and its movers post.
    const editionError = await archiveEdition(supabase, season, editionWeek, editionCards, takenAt);
    if (editionError) {
      console.warn(`[${label}] Could not archive the ${editionWeek} edition (migration applied?): ${editionError}`);
    } else {
      console.log(`[${label}] Archived ${editionCards.length} cards as the ${editionWeek} edition.`);
    }
  }

  const { error: upsertError } = await supabase.from("card_snapshots").upsert(
    cards.map((card) => ({
      season,
      slug: card.slug,
      overall: card.overall,
      tier: card.tier.label,
      taken_at: takenAt,
    })),
    { onConflict: "season,slug" },
  );
  if (upsertError) throw upsertError;
  console.log(`[${label}] Snapshot refreshed for ${cards.length} cards.`);

  // Append-only history feeds the share page's season-journey strip.
  // Tolerated failure: the 20260826000014 migration may not be applied yet.
  const { error: historyError } = await supabase.from("card_rating_history").insert(
    cards.map((card) => ({
      season,
      slug: card.slug,
      overall: card.overall,
      tier: card.tier.label,
      taken_at: takenAt,
    })),
  );
  if (historyError) {
    console.warn(`[${label}] Could not append rating history (migration applied?): ${historyError.message}`);
  } else {
    console.log(`[${label}] Rating history appended for ${cards.length} cards.`);
  }
}

/** The raw_stats columns the weekly power aggregation reads, plus the date
 *  the week filter needs. Deduplicated because WEEKLY_STAT_COLUMNS already
 *  carries summoner_name/tag/season. */
const FANTASY_STAT_COLUMNS = [...new Set<string>([...WEEKLY_STAT_COLUMNS, "game_date"])].join(",");

function fantasyStandings(lineups: FantasyLineupRow[]): FantasyLineupRow[] {
  return [...lineups].sort(
    (a, b) => (b.score ?? -1) - (a.score ?? -1) || a.submittedAt.localeCompare(b.submittedAt),
  );
}

/**
 * Grades and pays out one league's fantasy week.
 *
 * Two separately idempotent halves, both keyed off columns already on the
 * row: an entry with `scored_at` set is never re-scored (so a re-run can't
 * move a published leaderboard), and a payout is claimed with a
 * `paid_out is null` guard before `fantasy_payout` credits it — the
 * exactly-once contract the RPC's comment spells out
 * (20260826000015_card_packs_fantasy.sql). A crash between the claim and
 * the credit therefore under-pays rather than double-pays, which is the
 * side of that trade a human can fix from the ledger.
 */
async function scoreFantasyWeek(
  supabase: SupabaseClient,
  league: CardLeague,
  season: string,
  webhookUrl: string | null,
  origin: string | null,
): Promise<void> {
  const label = LEAGUE_LABELS[league];
  const hubPath = league === "academy" ? "/academy/cards/fantasy" : "/cards/fantasy";
  const footer = origin ? `${origin}${hubPath}` : `FPL ${label.toLowerCase()} fantasy`;

  // Test knobs (manual workflow runs): FANTASY_DRY_RUN computes scores,
  // payout plans, and the Discord body but writes NOTHING — no scored_at,
  // no claims, no credits, no post — so admins can rehearse a grading run
  // against live data without moving a published week or a wallet.
  // FANTASY_WEEK points the run at a specific Monday instead of the last
  // completed one (pair it with dry-run unless you truly mean to grade).
  const dryRun = process.env.FANTASY_DRY_RUN === "true";
  const weekOverride = process.env.FANTASY_WEEK?.trim() || null;
  if (weekOverride && weekOverride !== mondayOf(new Date(`${weekOverride}T12:00:00Z`))) {
    throw new Error(`FANTASY_WEEK must be a Monday in YYYY-MM-DD form; got "${weekOverride}"`);
  }

  // The week whose lock has passed — i.e. the one Monday night's games just
  // decided, not the one managers are currently drafting for.
  const week = weekOverride ?? lastCompletedWeek(new Date());
  if (dryRun) console.log(`[${label}] FANTASY DRY RUN — week ${week}: nothing will be written, paid, or posted.`);
  const lineups = await fetchWeekLineups(supabase, season, week);
  if (lineups.length === 0) {
    console.log(`[${label}] No fantasy lineups for the week of ${week} — nothing to score.`);
    return;
  }

  const unscored = lineups.filter((lineup) => lineup.scoredAt === null);
  let scoredNow = 0;

  if (unscored.length === 0) {
    console.log(`[${label}] Fantasy week ${week}: all ${lineups.length} lineup(s) already scored.`);
  } else {
    const { data, error } = await supabase.from("raw_stats").select(FANTASY_STAT_COLUMNS).eq("season", season);
    if (error) throw error;
    // Filtered in JS rather than with a date range so the week boundary is
    // the same mondayOf the lineups were filed against — one definition of
    // a week, not a second one written in query params.
    const weekRows = (((data ?? []) as unknown) as WeeklyRawStatRow[]).filter(
      (row) => row.game_date && mondayOf(new Date(row.game_date)) === week,
    );
    const scores = weeklyScoresBySlug(weekRows);
    console.log(
      `[${label}] Fantasy week ${week}: ${weekRows.length} stat rows, ${scores.size} players rated — scoring ${unscored.length} lineup(s).`,
    );

    const scoredAt = new Date().toISOString();
    for (const lineup of unscored) {
      const { score, breakdown } = scoreLineup(lineup.slots, scores);
      if (!dryRun) {
        const { error: updateError } = await supabase
          .from("fantasy_lineups")
          .update({ score, breakdown, scored_at: scoredAt })
          .eq("discord_id", lineup.discordId)
          .eq("season", season)
          .eq("week_start", week);
        if (updateError) throw updateError;
      } else {
        console.log(`[${label}] [dry-run] would score ${lineup.discordId}: ${score.toFixed(1)} pts`);
      }
      // Merged in memory so the payout pass below doesn't need a re-read.
      lineup.score = score;
      lineup.breakdown = breakdown;
      lineup.scoredAt = scoredAt;
      scoredNow += 1;
    }
    console.log(`[${label}] ${dryRun ? "[dry-run] would have scored" : "Scored"} ${scoredNow} fantasy lineup(s).`);
  }

  const standings = fantasyStandings(lineups);
  const byDiscordId = new Map(lineups.map((lineup) => [lineup.discordId, lineup]));
  const plans = planPayouts(standings.map((lineup) => ({ discordId: lineup.discordId, score: lineup.score ?? 0 })));

  for (const plan of plans) {
    const lineup = byDiscordId.get(plan.discordId);
    if (!lineup || lineup.paidOut !== null) continue;
    if (dryRun) {
      console.log(`[${label}] [dry-run] would pay $${plan.amount} to ${plan.discordId} (rank ${plan.rank}, week ${week}).`);
      continue;
    }

    // Claim first: the `paid_out is null` filter is what makes the pair
    // exactly-once, and fantasy_payout refuses to credit without it.
    const { data: claimed, error: claimError } = await supabase
      .from("fantasy_lineups")
      .update({ paid_out: plan.amount })
      .eq("discord_id", plan.discordId)
      .eq("season", season)
      .eq("week_start", week)
      .is("paid_out", null)
      .select("discord_id");
    if (claimError) {
      console.error(`[${label}] Could not claim $${plan.amount} for ${plan.discordId} (week ${week}): ${claimError.message}`);
      continue;
    }
    if (!claimed || claimed.length === 0) {
      console.log(`[${label}] Payout for ${plan.discordId} (week ${week}) was already claimed — skipping.`);
      continue;
    }

    const { error: payError } = await supabase.rpc("fantasy_payout", {
      p_user: plan.discordId,
      p_amount: plan.amount,
      p_season: season,
      p_week: week,
    });
    if (payError) {
      // The claim stands, so a retry won't pay twice — this needs a human
      // with the ledger, not another automatic attempt.
      console.error(
        `[${label}] CLAIMED BUT UNPAID: $${plan.amount} for ${plan.discordId} (week ${week}) — reconcile via betting_ledger: ${payError.message}`,
      );
      continue;
    }
    lineup.paidOut = plan.amount;
    console.log(`[${label}] Paid $${plan.amount} to ${plan.discordId} (rank ${plan.rank}, week ${week}).`);
  }

  // Only a run that actually graded something posts: a re-run of an already
  // scored week shouldn't repost last week's leaderboard. (Dry runs always
  // build the preview — that's the point of rehearsing.)
  if (!dryRun) {
    if (!webhookUrl) {
      console.log(`[${label}] DISCORD_CARDS_WEBHOOK_URL not set — skipping the fantasy post.`);
      return;
    }
    if (scoredNow === 0) {
      console.log(`[${label}] Fantasy week ${week} was already graded — not reposting.`);
      return;
    }
  }

  const names = await fetchBettingUsernames(supabase, standings.map((lineup) => lineup.discordId));
  const nameOf = (discordId: string) => names.get(discordId) ?? discordId;
  const scored = standings.filter((lineup) => lineup.score !== null);

  const lines = [
    "**Top lineups**",
    ...scored.slice(0, 5).map(
      (lineup, index) => `**${index + 1}.** ${nameOf(lineup.discordId)} — ${(lineup.score ?? 0).toFixed(1)} pts`,
    ),
  ];
  const paidLines = (dryRun ? plans : plans.filter((plan) => (byDiscordId.get(plan.discordId)?.paidOut ?? null) !== null))
    .map((plan) => `💰 $${plan.amount} → ${nameOf(plan.discordId)}`);
  if (paidLines.length > 0) lines.push("", "**Payouts**", ...paidLines);
  lines.push("", `${lineups.length} lineup${lineups.length === 1 ? "" : "s"} entered.`);

  if (dryRun) {
    console.log(`[${label}] [dry-run] Discord embed preview:\n🏆 ${label} fantasy — week of ${week}\n${lines.join("\n")}`);
    return;
  }
  // Unreachable when null (guarded above for real runs) — narrows the type.
  if (!webhookUrl) return;
  await postEmbed(webhookUrl, `🏆 ${label} fantasy — week of ${week}`, lines.join("\n"), footer);
  console.log(`[${label}] Posted the fantasy leaderboard (${lineups.length} entrants, ${paidLines.length} payouts).`);
}

async function main(): Promise<void> {
  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  const webhookUrl = process.env.DISCORD_CARDS_WEBHOOK_URL ?? null;
  const origin = process.env.SITE_ORIGIN?.replace(/\/$/, "") ?? null;

  const seasons = await fetchAllCardSeasons(supabase);
  if (seasons.length === 0) throw new Error("league_settings has no seasons configured");

  for (const { league, season } of seasons) {
    await processSeason(supabase, league, season, webhookUrl, origin);
    // Non-fatal by construction: fantasy is a later migration than the card
    // drop, and an environment without it (or a bad week of stats) must
    // still get its snapshots and its movers post.
    try {
      await scoreFantasyWeek(supabase, league, season, webhookUrl, origin);
    } catch (error) {
      console.error(`[${LEAGUE_LABELS[league]}] Fantasy scoring failed — card drop unaffected:`, error);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

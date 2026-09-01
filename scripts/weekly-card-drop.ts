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
import {
  fetchAllCardSeasons,
  fetchLatestGameWeek,
  fetchSeasonCards,
  fetchWeekCards,
  type CardLeague,
} from "../src/lib/cards/queries";
import type { PlayerCardData } from "../src/lib/cards/build";
import { settleGauntletWeek } from "../src/lib/gauntlet/settle";
import { archiveEdition } from "../src/lib/cards/editions";
import { ingestVerdict } from "../src/lib/cards/ingestFreshness";
import { planPayouts } from "../src/lib/fantasy/payouts";
import { fetchBettingUsernames, fetchWeekLineups, type FantasyLineupRow } from "../src/lib/fantasy/queries";
import {
  type CurrentIdentity,
  inventoryIdsIn,
  scoreLineup,
  weeklyScoresBySlug,
} from "../src/lib/fantasy/scoring";
import { lastCompletedWeek } from "../src/lib/fantasy/week";
import { PACK_COST } from "../src/lib/packs/config";
import { mondayOf } from "../src/lib/packs/week";
import { WEEKLY_STAT_COLUMNS, type WeeklyRawStatRow } from "../src/lib/stats/weekly";
import { formatMatchWinPayouts, type MatchWinPayoutLine } from "../src/lib/betting/match-wins";

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

function parseMatchWinPayment(data: unknown): { paid: boolean; amount: number } {
  const row = Array.isArray(data) ? data[0] : data;
  if (typeof row !== "object" || row === null) return { paid: false, amount: 0 };
  const payment = row as { paid?: unknown; amount?: unknown };
  return { paid: payment.paid === true, amount: Number(payment.amount ?? 0) };
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

  // Before anything is written or posted: is the data this drop reports on
  // actually here? See assertIngestIsFresh.
  await assertIngestIsFresh(supabase, label, season, editionWeek);

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
    const { error: editionError, pruned } = await archiveEdition(
      supabase,
      season,
      editionWeek,
      editionCards,
      takenAt,
    );
    if (editionError) {
      console.warn(`[${label}] Could not archive the ${editionWeek} edition (migration applied?): ${editionError}`);
    } else {
      const removed = pruned > 0 ? `, removed ${pruned} no longer in that week's pool` : "";
      console.log(`[${label}] Archived ${editionCards.length} cards as the ${editionWeek} edition${removed}.`);
      // The week's crowns are also the week's ECLIPSE slots — five new
      // one-of-ones enter the pool the moment the edition lands, and a
      // board that grows in silence may as well not grow. Announced only
      // on a successful archive: these cards are claimable through this
      // week's packs, and promising a chase the archive step just failed
      // to create would be worse than saying nothing.
      await postEclipseBoard(supabase, season, label, editionWeek, editionCards, webhookUrl);
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

    // A slot's slug is frozen at submit time; the score map is keyed by the
    // slug raw_stats produces TODAY. A Riot rename moves the second and not
    // the first, and the slot then scores 0 while the renamed player's real
    // points go unclaimed. The card copy is the stable link between them —
    // inventoryId survives a rename, and card_inventory.slug is updated by
    // one — so resolve through it before scoring anything.
    const identities = new Map<number, CurrentIdentity>();
    const inventoryIds = inventoryIdsIn(unscored);
    if (inventoryIds.length > 0) {
      // Paged on the primary key: PostgREST caps an unpaged select at
      // max_rows and says nothing, and a lineup silently dropping off the
      // end would score its slots against stale slugs — the exact bug this
      // lookup exists to prevent.
      const pageSize = 500;
      for (let from = 0; from < inventoryIds.length; from += pageSize) {
        const { data: copies, error: copyError } = await supabase
          .from("card_inventory")
          .select("id, slug, player_name")
          .in("id", inventoryIds.slice(from, from + pageSize));
        if (copyError) throw copyError;
        for (const copy of ((copies ?? []) as { id: number; slug: string; player_name: string }[])) {
          identities.set(copy.id, { slug: copy.slug, playerName: copy.player_name });
        }
      }
    }
    const renamed = inventoryIds.filter((id) => identities.has(id)).length;
    console.log(
      `[${label}] Fantasy week ${week}: ${weekRows.length} stat rows, ${scores.size} players rated, `
      + `${renamed}/${inventoryIds.length} fielded copies resolved — scoring ${unscored.length} lineup(s).`,
    );

    const scoredAt = new Date().toISOString();
    for (const lineup of unscored) {
      const { score, breakdown } = scoreLineup(lineup.slots, scores, identities);
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

// A free pack's worth, per member, per won match — the amount the user
// asked for ("betting dollars or maybe a free pack"): dollars that ARE a
// pack, spendable as one or banked.
const MATCH_WIN_BONUS = PACK_COST;

/**
 * Pays every identified member of each winning team a pack's worth of
 * betting dollars for the week's decided fixtures.
 *
 * Winners come from fixtures scores; membership comes from APPROVED
 * player_identity_links plus the team's captains — the same canonical
 * identity chain My Team access uses. A winner with no approved link (or
 * no betting profile) is simply not paid: claiming your identity is what
 * connects your match wins to your wallet.
 *
 * Exactly-once is the database's job, not this function's: pay_match_win
 * claims (fixture, user) and credits in one transaction, returning false
 * on a replay — so a re-run of the drop pays nobody twice and the embed
 * only posts when something was newly paid.
 */
async function payMatchWinBonuses(
  supabase: SupabaseClient,
  league: CardLeague,
  season: string,
  webhookUrl: string | null,
): Promise<void> {
  const label = LEAGUE_LABELS[league];
  // MATCH_WIN_WEEK (manual runs) points at a specific Monday — for paying
  // out a week the drop missed. Idempotency makes re-runs safe either way.
  const weekOverride = process.env.MATCH_WIN_WEEK?.trim() || null;
  if (weekOverride && weekOverride !== mondayOf(new Date(`${weekOverride}T12:00:00Z`))) {
    throw new Error(`MATCH_WIN_WEEK must be a Monday in YYYY-MM-DD form; got "${weekOverride}"`);
  }
  const week = weekOverride ?? lastCompletedWeek(new Date());

  const { data: fixtureData, error: fixturesError } = await supabase
    .from("fixtures")
    .select("id, team_a, team_b, score_a, score_b, scheduled_at")
    .eq("season", season)
    .not("score_a", "is", null);
  if (fixturesError) throw fixturesError;
  type FixtureRow = {
    id: string;
    team_a: string | null;
    team_b: string | null;
    score_a: number | null;
    score_b: number | null;
    scheduled_at: string | null;
  };
  // Filtered in JS with the same mondayOf the lineups and stats use — one
  // definition of a week, not a second one in query params. Ties (score
  // constraint allows them) decide no winner and pay nothing.
  const decided = ((fixtureData ?? []) as FixtureRow[]).filter(
    (fixture) =>
      fixture.scheduled_at !== null &&
      mondayOf(new Date(fixture.scheduled_at)) === week &&
      fixture.team_a !== null &&
      fixture.team_b !== null &&
      fixture.score_a !== null &&
      fixture.score_b !== null &&
      fixture.score_a !== fixture.score_b,
  );
  if (decided.length === 0) {
    console.log(`[${label}] No decided fixtures in the week of ${week} — no match bonuses.`);
    return;
  }

  // fixtures stores team NAMES; league_teams is the canonical roster
  // anchor. Matched case-insensitively, the same normalization the
  // identity-link roster proof uses.
  const { data: teamData, error: teamsError } = await supabase.from("league_teams").select("id, name");
  if (teamsError) throw teamsError;
  const teamIdByName = new Map(
    ((teamData ?? []) as { id: string; name: string }[]).map((team) => [team.name.trim().toLowerCase(), team.id]),
  );

  const wins = decided.map((fixture) => {
    const aWon = (fixture.score_a ?? 0) > (fixture.score_b ?? 0);
    const winnerName = (aWon ? fixture.team_a : fixture.team_b) as string;
    const loserName = (aWon ? fixture.team_b : fixture.team_a) as string;
    return {
      fixtureId: fixture.id,
      winnerName,
      loserName,
      score: aWon ? `${fixture.score_a}–${fixture.score_b}` : `${fixture.score_b}–${fixture.score_a}`,
      teamId: teamIdByName.get(winnerName.trim().toLowerCase()) ?? null,
    };
  });
  for (const win of wins.filter((w) => !w.teamId)) {
    console.log(`[${label}] Fixture winner "${win.winnerName}" matches no league team — nobody to pay.`);
  }
  const teamIds = [...new Set(wins.flatMap((win) => (win.teamId ? [win.teamId] : [])))];
  if (teamIds.length === 0) return;

  const [linksRes, captainsRes] = await Promise.all([
    supabase
      .from("player_identity_links")
      .select("league_team_id, profile_id")
      .eq("league", league)
      .eq("season", season)
      .eq("status", "approved")
      .in("league_team_id", teamIds),
    supabase
      .from("league_team_captains")
      .select("league_team_id, profile_id")
      .eq("season", season)
      .in("league_team_id", teamIds),
  ]);
  if (linksRes.error) throw linksRes.error;
  if (captainsRes.error) throw captainsRes.error;
  const membership = new Map<string, Set<string>>();
  const memberRows = [...(linksRes.data ?? []), ...(captainsRes.data ?? [])] as {
    league_team_id: string | null;
    profile_id: string;
  }[];
  for (const row of memberRows) {
    if (!row.league_team_id) continue;
    const set = membership.get(row.league_team_id) ?? new Set<string>();
    set.add(row.profile_id);
    membership.set(row.league_team_id, set);
  }
  const profileIds = [...new Set([...membership.values()].flatMap((set) => [...set]))];
  if (profileIds.length === 0) {
    console.log(`[${label}] Winning teams have no identified members — nobody to pay.`);
    return;
  }

  const { data: profileData, error: profilesError } = await supabase
    .from("betting_profiles")
    .select("discord_id, username, profile_id")
    .in("profile_id", profileIds);
  if (profilesError) throw profilesError;
  const bettingByProfile = new Map(
    ((profileData ?? []) as { discord_id: string; username: string; profile_id: string | null }[])
      .filter((row) => row.profile_id !== null)
      .map((row) => [row.profile_id as string, row]),
  );

  const lines: string[] = [];
  let paidCount = 0;
  for (const win of wins) {
    if (!win.teamId) continue;
    const paidPayouts: MatchWinPayoutLine[] = [];
    for (const profileId of membership.get(win.teamId) ?? []) {
      const profile = bettingByProfile.get(profileId);
      if (!profile) continue;
      const { data: paymentData, error: payError } = await supabase.rpc("pay_match_win", {
        p_fixture: win.fixtureId,
        p_user: profile.discord_id,
        p_season: season,
        p_week: week,
        p_amount: MATCH_WIN_BONUS,
      });
      if (payError) {
        // Migration not applied is the expected shape here; the drop
        // proper must survive it either way.
        console.error(`[${label}] pay_match_win failed for ${profile.discord_id}: ${payError.message}`);
        continue;
      }
      const payment = parseMatchWinPayment(paymentData);
      if (payment.paid && payment.amount > 0) paidPayouts.push({ username: profile.username, amount: payment.amount });
    }
    if (paidPayouts.length > 0) {
      lines.push(`**${win.winnerName}** ${win.score} ${win.loserName} — ${formatMatchWinPayouts(paidPayouts)}`);
      paidCount += paidPayouts.length;
    }
  }

  if (paidCount === 0) {
    console.log(`[${label}] Match bonuses for the week of ${week} were already paid — nothing new.`);
    return;
  }
  console.log(`[${label}] Paid ${paidCount} match win bonus(es) for the week of ${week}.`);
  if (!webhookUrl) return;
  await postEmbed(
    webhookUrl,
    `🏅 ${label} match win bonuses — week of ${week}`,
    lines.join("\n"),
    "A free pack's worth for taking your match. Claim your player identity to get yours.",
  );
}

/**
 * Announces the week's new Eclipse slots, and the running count of every
 * one-of-one still unclaimed across all weeks.
 *
 * The mechanics need no help — eligibility is derived from the crowns the
 * archive just froze, so the slots exist whether or not anyone says so.
 * This is purely the town crier: the whole design leans on people knowing
 * the board grows every week and that OLD weeks stay in play, and neither
 * fact is visible anywhere unless the drop says it.
 */
async function postEclipseBoard(
  supabase: SupabaseClient,
  season: string,
  label: string,
  editionWeek: string,
  editionCards: { slug: string; name: string; role: string; standout?: boolean }[],
  webhookUrl: string | null,
): Promise<void> {
  if (!webhookUrl) return;
  const crowned = editionCards.filter((card) => card.standout);
  if (crowned.length === 0) return;

  // The running board: every crowned print across the season's archive,
  // less the Eclipses already minted. Both reads are small (one row per
  // crowned card, one per minted Eclipse) and both tolerate failure — a
  // miscounted footer must not take down the drop, so on any error the
  // post simply omits the running total.
  let unclaimedLine = "";
  try {
    const [{ data: crowns }, { data: minted }] = await Promise.all([
      supabase.from("card_editions").select("edition_week, slug").eq("season", season).filter("card->>standout", "eq", "true"),
      supabase.from("card_inventory").select("edition_week, slug").eq("season", season).eq("foil_type", "eclipse"),
    ]);
    if (crowns) {
      const taken = new Set(((minted ?? []) as { edition_week: string; slug: string }[]).map((row) => `${row.edition_week}|${row.slug}`));
      const open = (crowns as { edition_week: string; slug: string }[]).filter((row) => !taken.has(`${row.edition_week}|${row.slug}`)).length;
      unclaimedLine = `\n\n**${open}** Eclipse${open === 1 ? "" : "s"} now unclaimed across every week — old weeks stay in play.`;
    }
  } catch {
    // The five new names still post.
  }

  const lines = crowned
    .sort((a, b) => a.role.localeCompare(b.role))
    .map((card) => `🌑 **${card.name}** — ${card.role}`);
  await postEmbed(
    webhookUrl,
    `🌑 ${label} — five new 1/1s enter the pool`,
    `This week's Cards of the Week can now go **Eclipse** in ${editionWeek} packs:\n\n${lines.join("\n")}${unclaimedLine}`,
    "One of each will ever exist. First to pull it owns the only copy.",
  );
}

/** Pays out last week's Gauntlet pot and posts the podium. The settle
 *  helper is burn-first idempotent, so a re-run of this job is a no-op. */
async function settleLastGauntletWeek(
  supabase: SupabaseClient,
  season: string,
  webhookUrl: string | null,
): Promise<void> {
  const thisMonday = new Date(`${mondayOf(new Date())}T00:00:00.000Z`);
  const lastMonday = new Date(thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const result = await settleGauntletWeek(supabase, season, lastMonday);
  if (!result.settled) {
    console.log(`[Premier] Gauntlet week ${lastMonday}: ${result.reason ?? "not settled"}`);
    return;
  }
  console.log(`[Premier] Gauntlet week ${lastMonday}: pot ${result.pot}, paid ${result.paid}`);
  if (!webhookUrl || result.standings.length === 0) return;
  const medals = ["🥇", "🥈", "🥉"];
  const lines = result.standings.slice(0, 3).map((standing, index) =>
    `${medals[index]} **${standing.username ?? "Unknown"}** — ${standing.score.toLocaleString()}${standing.cleared ? " · FULL CLEAR 🏆" : ""}${standing.prize > 0 ? ` · +$${standing.prize}` : ""}`,
  );
  const clears = result.standings.filter((standing) => standing.cleared).length;
  await postEmbed(
    webhookUrl,
    "⚔ The Gauntlet — the week's board",
    `${lines.join("\n")}\n\nPot: **$${result.pot}** across ${result.standings.length} runner${result.standings.length === 1 ? "" : "s"}${clears > 0 ? ` · ${clears} full clear${clears === 1 ? "" : "s"}` : " · the eighth round went unbeaten"}`,
    "New week, new bracket — /cards/gauntlet",
  );
}

/**
 * Refuses the drop when the week's games were played but never ingested.
 *
 * The rule itself lives in src/lib/cards/ingestFreshness.ts so it can be
 * tested without a database; this does the two reads it needs and turns a
 * refusal into a failed job.
 */
async function assertIngestIsFresh(
  supabase: SupabaseClient,
  label: string,
  season: string,
  editionWeek: string,
): Promise<void> {
  if (process.env.SKIP_INGEST_CHECK === "true") {
    console.warn(`[${label}] SKIP_INGEST_CHECK set — proceeding without checking the ingest.`);
    return;
  }
  const latest = await fetchLatestGameWeek(supabase, season);
  const { data, error } = await supabase
    .from("fixtures")
    .select("id, scheduled_at, score_a")
    .eq("season", season)
    .not("score_a", "is", null);
  // A read that failed says nothing either way, and refusing on it would
  // turn a blip in the fixtures table into a missed drop.
  if (error) {
    console.warn(`[${label}] Could not check fixtures for the ingest freshness gate: ${error.message}`);
    return;
  }
  const played = ((data ?? []) as { scheduled_at: string | null }[]).filter(
    (fixture) => fixture.scheduled_at && mondayOf(new Date(fixture.scheduled_at)) === editionWeek,
  ).length;

  const verdict = ingestVerdict(editionWeek, latest, played);
  if (verdict.ok) {
    if (verdict.reason === "no-games-played") {
      console.log(`[${label}] No fixtures played in the week of ${editionWeek} — nothing for the ingest to have missed.`);
    }
    return;
  }
  throw new Error(`[${label}] Refusing to drop: ${verdict.message}`);
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
    // Same tolerance: an environment without the match_win_bonus migration
    // (or a week with no fixtures) must not dent the drop or fantasy.
    try {
      await payMatchWinBonuses(supabase, league, season, webhookUrl);
    } catch (error) {
      console.error(`[${LEAGUE_LABELS[league]}] Match win bonuses failed — card drop unaffected:`, error);
    }
    // The Gauntlet settles the week that just ENDED — premier only, and
    // with the same tolerance as everything above.
    if (league === "premier") {
      try {
        await settleLastGauntletWeek(supabase, season, webhookUrl);
      } catch (error) {
        console.error(`[${LEAGUE_LABELS[league]}] Gauntlet settlement failed — card drop unaffected:`, error);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

// The league goal's step in the expedition sweep: for this week and last,
// in every season with runs home, ask whether the week's goal has been
// reached, and when the view says it has, let fell_expedition_league_goal
// decide (20261103000001). That RPC is the only place a goal falls: it
// recounts the week itself, writes the goal once, and pays each
// contributor one fragment in the same transaction. This file only knows
// WHEN to ask, and says so in Discord the one time a goal actually falls.
//
// Called once per sweep from sweepExpeditions (runs.ts) with the service
// client. Never throws for the database: an environment without the
// migration reads as "no league goal" and the step reports and skips, so
// the rest of the sweep is never held up by it.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GOLD, postCardsWebhook, type CardsEmbed } from "@/lib/packs/announce";
import { fetchLeagueFixtures, fetchLeagueProgress } from "./queries";
import { goalProgress, leagueGoalFor, unitCount, unitVerb, weeksToWatch, type LeagueFixture, type LeagueGoal } from "./league";

export interface LeagueSweepResult {
  /** (season, week) pairs with any claimed run in them. */
  checked: number;
  /** Goals that fell on this pass (not ones that fell before). */
  fell: number;
  /** Collectors paid a fragment on this pass. */
  rewarded: number;
  errors: string[];
}

interface FellRow {
  fell: boolean | null;
  rewarded: number | null;
  top_id: string | null;
}

/** The Discord post for a goal that just fell. Both leagues share the
 *  cards channel, so the title carries the season. */
export function leagueFallEmbed(goal: LeagueGoal, total: number, rewarded: number, topId: string | null): CardsEmbed {
  const verb = unitVerb(goal.unit);
  const who = rewarded === 1 ? "the 1 collector" : `each of the ${rewarded} collectors`;
  const vanguard = topId ? ` <@${topId}> did the most and is the week's Vanguard.` : "";
  return {
    title: `League goal ${goal.kind === "landmark" ? "reached" : "brought down"} — ${goal.title} (${goal.season})`,
    description:
      `The league ${verb} ${unitCount(total, goal.unit)} this week — the goal was ${goal.target}. ` +
      `A map fragment to ${who} who helped.${vanguard}`,
    color: GOLD,
  };
}

export async function sweepLeagueGoals(service: SupabaseClient, now = new Date()): Promise<LeagueSweepResult> {
  const result: LeagueSweepResult = { checked: 0, fell: 0, rewarded: 0, errors: [] };
  const weeks = weeksToWatch(now);

  let readError = "progress unreadable";
  const rows = await fetchLeagueProgress(service, null, weeks, (message) => {
    readError = message;
  });
  if (rows === null) {
    result.errors.push(`league: ${readError}`);
    return result;
  }

  // One goal per (season, week): a season's rows never meet another's.
  const pairs = new Map<string, { season: string; weekStart: string }>();
  for (const row of rows) {
    if (!weeks.includes(row.weekStart)) continue;
    pairs.set(`${row.season}\u0000${row.weekStart}`, { season: row.season, weekStart: row.weekStart });
  }
  result.checked = pairs.size;

  // The kind and the size come from the week alone; the fixtures only
  // name it, so they are read only when there is a fall to announce.
  const due = [...pairs.values()]
    .map(({ season, weekStart }) => {
      const goal = leagueGoalFor(season, weekStart, []);
      return { season, weekStart, goal, progress: goalProgress(goal, rows) };
    })
    .filter((entry) => entry.progress.reached)
    .sort((a, b) => a.season.localeCompare(b.season) || a.weekStart.localeCompare(b.weekStart));
  if (due.length === 0) return result;

  let fixtures: LeagueFixture[] | null = null;
  for (const { season, weekStart, goal, progress } of due) {
    const { data, error } = await service.rpc("fell_expedition_league_goal", {
      p_season: season,
      p_week: weekStart,
      p_kind: goal.kind,
      p_target: goal.target,
    });
    if (error) {
      result.errors.push(`league ${season} ${weekStart}: ${error.message ?? String(error)}`);
      continue;
    }
    const row = (Array.isArray(data) ? data[0] : data) as FellRow | null;
    // Not fallen: the RPC's own count disagreed (a claim rolled back), or
    // the week closed. Already fallen: rewarded is 0 and it was announced
    // by the pass that paid.
    if (row?.fell !== true) continue;
    const rewarded = Number(row.rewarded ?? 0);
    if (rewarded <= 0) continue;
    result.fell += 1;
    result.rewarded += rewarded;

    fixtures ??= await fetchLeagueFixtures(service, null, weeks);
    const named = leagueGoalFor(season, weekStart, fixtures);
    try {
      await postCardsWebhook(leagueFallEmbed(named, progress.total, rewarded, row.top_id ?? null));
    } catch (announceError) {
      result.errors.push(`league announce ${season} ${weekStart}: ${announceError instanceof Error ? announceError.message : String(announceError)}`);
    }
  }
  return result;
}

/**
 * Prints the week's top cards per role, broken down into the exact inputs
 * that produced their OVR.
 *
 * Written because every rating question this season has needed the same
 * thing: not what the number IS, which the card already shows, but which
 * of its inputs made it that. Reading the rendered bar tells you the
 * former; only this tells you the latter. SQL could approximate it, but an
 * approximation of the formula is its own source of wrong answers — this
 * calls the real build, so what it prints is what the card did.
 *
 * Run: npx tsx scripts/inspect-card-scores.ts [top N per role]
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Read-only.
 */
import { createClient } from "@supabase/supabase-js";
import { OVR_BASE, OVR_SCALE, scoreWeightsForRole } from "../src/lib/cards/build";
import { fetchAllCardSeasons, fetchCurrentWeekCards } from "../src/lib/cards/queries";
import type { PlayerCardData } from "../src/lib/cards/build";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** raw_stats' spelling, which is what the weights are keyed by. */
const ROLE_ORDER = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

/** The card's role label back to raw_stats' spelling. */
const ROLE_MODE: Record<string, string> = {
  Top: "TOP",
  Jungle: "JUNGLE",
  Mid: "MIDDLE",
  Bot: "BOTTOM",
  Support: "UTILITY",
};

function pad(value: string | number, width: number): string {
  return String(value).padStart(width);
}

function describe(card: PlayerCardData): string {
  const roleMode = ROLE_MODE[card.role] ?? card.role.toUpperCase();
  const weights = scoreWeightsForRole(roleMode) as Record<string, number>;
  // The card's displayed bars are squeezed into 20-99; the score uses the
  // raw percentile. Undo the squeeze so the printed numbers are the ones
  // the weights actually multiplied.
  const bars = card.subStats
    .map((stat) => {
      const raw = (stat.value - 20) / 0.79;
      const weight = weights[stat.key] ?? 0;
      return `${stat.label} ${pad(Math.round(raw), 3)}(w${pad(weight, 2)})`;
    })
    .join("  ");
  const barMean =
    card.subStats.reduce((sum, stat) => sum + (stat.value - 20) / 0.79, 0) / (card.subStats.length || 1);
  const winrate = Math.round(card.winratePct);
  const score = (card.overall - OVR_BASE) / OVR_SCALE;
  return (
    `  ${card.name.padEnd(16)} OVR ${pad(card.overall, 2)}  score ${pad(score.toFixed(1), 5)}  ` +
    `${card.wins}-${card.losses} (win ${pad(winrate, 3)}, w${pad(weights.win ?? 0, 2)})  ` +
    `bars avg ${pad(Math.round(barMean), 3)}\n      ${bars}`
  );
}

async function main(): Promise<void> {
  const top = Number(process.argv[2] ?? 3);
  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  for (const { league, season } of await fetchAllCardSeasons(supabase)) {
    const cards = await fetchCurrentWeekCards(supabase, season);
    console.log(`\n=== ${league} · season ${season} · ${cards.length} cards ===`);
    if (cards.length === 0) continue;

    for (const roleMode of ROLE_ORDER) {
      const inRole = cards
        .filter((card) => (ROLE_MODE[card.role] ?? card.role.toUpperCase()) === roleMode)
        .sort((a, b) => b.overall - a.overall);
      if (inRole.length === 0) continue;
      // The cohort size matters: percentiles are role-relative, so a role
      // with four players spreads differently than one with fourteen.
      console.log(`\n${roleMode}  (${inRole.length} in cohort, ceiling ${inRole[0].overall})`);
      for (const card of inRole.slice(0, top)) console.log(describe(card));
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

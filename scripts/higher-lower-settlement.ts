import { createHash } from "node:crypto";
import { basename } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const TIME_ZONE = "America/New_York";
const PRIZE_POOL = 2_000;

interface LocalParts {
  year: string;
  month: string;
  day: string;
  weekday: string;
  hour: number;
}

export interface HigherLowerSettlementWindow {
  eligible: boolean;
  localDate: string;
  localHour: number;
  weekStart: string;
}

interface RunRow {
  profile_id: string;
  run_score: number;
}

interface WalletRow {
  profile_id: string;
  discord_id: string;
  username: string;
}

interface SettlementRow {
  week_start: string;
  top_score: number;
  prize_pool: number;
  winner_count: number;
  settled_at: string | null;
  status: string;
}

function localParts(now: Date): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    weekday: values.weekday,
    hour: Number(values.hour),
  };
}

function localDateFromParts(parts: LocalParts): string {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function previousCompletedMonday(localDate: string): string {
  const date = new Date(`${localDate}T12:00:00.000Z`);
  const day = date.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday - 7);
  return date.toISOString().slice(0, 10);
}

export function settlementWindow(now: Date): HigherLowerSettlementWindow {
  const parts = localParts(now);
  const localDate = localDateFromParts(parts);
  return {
    eligible: parts.weekday === "Mon" && parts.hour >= 20,
    localDate,
    localHour: parts.hour,
    weekStart: previousCompletedMonday(localDate),
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function isMonday(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getUTCDay() === 1;
}

function isTrue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

function remainderOrder(weekStart: string, profileIds: string[]): string[] {
  return [...profileIds].sort(
    (a, b) =>
      createHash("md5").update(`${weekStart}:${a}`).digest("hex").localeCompare(createHash("md5").update(`${weekStart}:${b}`).digest("hex")) ||
      a.localeCompare(b),
  );
}

async function previewSettlement(supabase: SupabaseClient, weekStart: string): Promise<void> {
  const end = new Date(`${weekStart}T12:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 7);
  const { data: runData, error: runError } = await supabase
    .from("higher_lower_daily_runs")
    .select("profile_id, run_score")
    .gte("puzzle_date", weekStart)
    .lt("puzzle_date", end.toISOString().slice(0, 10));
  if (runError) throw runError;

  const best = new Map<string, number>();
  for (const run of (runData as RunRow[] | null) ?? []) {
    best.set(run.profile_id, Math.max(best.get(run.profile_id) ?? 0, Number(run.run_score)));
  }
  const profileIds = [...best.keys()];
  const { data: walletData, error: walletError } = profileIds.length
    ? await supabase.from("betting_profiles").select("profile_id, discord_id, username").in("profile_id", profileIds)
    : { data: [], error: null };
  if (walletError) throw walletError;

  const wallets = (walletData as WalletRow[] | null) ?? [];
  const eligibleWinners = wallets.filter((wallet) => best.has(wallet.profile_id));
  const topScore = eligibleWinners.reduce((top, wallet) => Math.max(top, best.get(wallet.profile_id) ?? 0), 0);
  const winners = eligibleWinners.filter((wallet) => best.get(wallet.profile_id) === topScore);
  const ordered = remainderOrder(weekStart, winners.map((winner) => winner.profile_id));
  const base = winners.length ? Math.floor(PRIZE_POOL / winners.length) : 0;
  const remainder = winners.length ? PRIZE_POOL % winners.length : 0;

  console.log(JSON.stringify({
    dryRun: true,
    weekStart,
    topScore,
    winnerCount: winners.length,
    prizePool: PRIZE_POOL,
    winners: winners.map((winner) => ({
      profileId: winner.profile_id,
      discordId: winner.discord_id,
      username: winner.username,
      award: base + (ordered.indexOf(winner.profile_id) < remainder ? 1 : 0),
    })),
  }, null, 2));
}

export async function main(): Promise<void> {
  const now = process.env.HIGHER_LOWER_NOW ? new Date(process.env.HIGHER_LOWER_NOW) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("HIGHER_LOWER_NOW must be an ISO timestamp");
  const window = settlementWindow(now);
  const manual = isTrue(process.env.HIGHER_LOWER_MANUAL);
  const dryRun = isTrue(process.env.HIGHER_LOWER_DRY_RUN);
  const override = process.env.HIGHER_LOWER_WEEK?.trim() || null;

  if (override && !isMonday(override)) {
    throw new Error(`HIGHER_LOWER_WEEK must be a Monday UTC date (YYYY-MM-DD); got "${override}"`);
  }
  if (!manual && !window.eligible) {
    console.log(`Skipping Higher or Lower settlement: ${window.localDate} ${window.localHour}:00 ${TIME_ZONE} is before Monday 8 PM.`);
    return;
  }

  const weekStart = override ?? window.weekStart;
  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  if (dryRun) {
    await previewSettlement(supabase, weekStart);
    return;
  }

  const { data, error } = await supabase.rpc("settle_higher_lower_week", { p_week_start: weekStart });
  if (error) throw new Error(`Higher or Lower settlement failed: ${error.message}`);
  const row = (data as SettlementRow[] | null)?.[0];
  if (!row) throw new Error("Higher or Lower settlement returned no result");
  console.log(`${row.status}: week ${row.week_start}, top score ${row.top_score}, ${row.winner_count} winner(s), ${row.prize_pool} betting dollars.`);
}

if (basename(process.argv[1] ?? "") === "higher-lower-settlement.ts") {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

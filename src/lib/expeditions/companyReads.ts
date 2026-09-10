// The reads behind company.ts: other collectors' runs on a route, the
// league's `route` graves, and the usernames to say who. Service-client
// only — expedition_runs and expedition_graveyard are owner-scoped under
// RLS, and a signed-in user's own client would see nobody on the road.
// Framework-free like queries.ts, so the page, the claim and the sweep
// all read the same way.

import type { SupabaseClient } from "@supabase/supabase-js";
import { encountersFor } from "./journal";
import { COMPANY_RULES } from "./routes";
import type { ExpeditionTierKey } from "./config";
import { RIVAL_WINDOW_MS, companyFor, tallyRivalries, type GraveCandidate, type RivalRecord, type Rivalry, type RoadCompany, type RunCandidate } from "./company";

/** A run to find the company of, with the teams its squad carries. */
export type CompanyRun = RunCandidate & { squadTeams: string[] };

interface OtherRunRow {
  id: number;
  discord_id: string;
  tier: string;
  shine: number;
  started_at: string;
  resolves_at: string;
  forks: number | null;
  rules: number | null;
  convoy: number | null;
}

interface GraveRow {
  id: number;
  discord_id: string;
  player_name: string;
  card: { teamName?: string | null } | null;
  died_at: string;
}

async function usernames(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return names;
  const { data } = await supabase.from("betting_profiles").select("discord_id, username").in("discord_id", wanted);
  for (const row of ((data as { discord_id: string; username: string | null }[] | null) ?? [])) names.set(row.discord_id, row.username ?? "Unknown");
  return names;
}

const candidateOf = (row: OtherRunRow): RunCandidate => ({
  id: row.id,
  discordId: row.discord_id,
  tier: row.tier,
  shine: Number(row.shine ?? 0),
  startedAt: row.started_at,
  resolvesAt: row.resolves_at,
  forks: Number(row.forks ?? 0),
  rules: Number(row.rules ?? 1),
  convoy: row.convoy === null || row.convoy === undefined ? null : Number(row.convoy),
});

const encountersOf = (run: RunCandidate) =>
  encountersFor({ id: run.id, tier: run.tier as ExpeditionTierKey, startedAt: run.startedAt, resolvesAt: run.resolvesAt, forks: run.forks, rules: run.rules, convoy: run.convoy });

/**
 * The company of each run given, by run id. One read for the other runs
 * on the same routes across a window a day either side of the runs, one
 * for the season's `route` graves, one for the names. A run below
 * COMPANY_RULES, a hold or an exorcism gets an empty company and costs
 * nothing.
 */
export async function fetchCompanies(supabase: SupabaseClient, season: string, runs: CompanyRun[]): Promise<Record<number, RoadCompany>> {
  const out: Record<number, RoadCompany> = {};
  const wanted = runs.filter((run) => run.rules >= COMPANY_RULES && run.tier !== "lost" && run.tier !== "exorcism" && run.forks > 0);
  if (wanted.length === 0) return out;
  const tiers = [...new Set(wanted.map((run) => run.tier))];
  const lo = Math.min(...wanted.map((run) => Date.parse(run.startedAt))) - RIVAL_WINDOW_MS;
  const hi = Math.max(...wanted.map((run) => Math.max(Date.parse(run.resolvesAt), Date.parse(run.startedAt) + RIVAL_WINDOW_MS)));
  const mine = new Set(wanted.map((run) => run.id));
  const [runsResult, gravesResult] = await Promise.all([
    supabase
      .from("expedition_runs")
      .select("id, discord_id, tier, shine, started_at, resolves_at, forks, rules, convoy")
      .eq("season", season)
      .in("tier", tiers)
      .gte("started_at", new Date(lo).toISOString())
      .lte("started_at", new Date(hi).toISOString())
      .limit(500),
    tiers.includes("legend") || tiers.includes("legendary") || tiers.includes("mythic")
      ? supabase.from("expedition_graveyard").select("id, discord_id, player_name, card, died_at").eq("season", season).eq("cause", "route").limit(500)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const others = (((runsResult.data as OtherRunRow[] | null) ?? []).map(candidateOf)).filter((run) => !mine.has(run.id));
  const graves: GraveCandidate[] = ((gravesResult.data as GraveRow[] | null) ?? []).map((row) => ({
    id: row.id,
    discordId: row.discord_id,
    playerName: row.player_name,
    team: row.card?.teamName ?? null,
    diedAt: row.died_at,
  }));
  const names = await usernames(supabase, [...others.map((run) => run.discordId), ...graves.map((grave) => grave.discordId)]);
  for (const run of wanted) {
    out[run.id] = companyFor({ mine: run, encounters: encountersOf(run), others, graves, names, squadTeams: run.squadTeams, encountersOf });
  }
  return out;
}

/** One run's company — the claim's and the ping's read. */
export async function fetchCompany(supabase: SupabaseClient, season: string, run: CompanyRun): Promise<RoadCompany | null> {
  return (await fetchCompanies(supabase, season, [run]))[run.id] ?? null;
}

interface RivalRunRow {
  discord_id: string;
  claimed_at: string | null;
  outcome: { rivals?: RivalRecord[] } | null;
}

/**
 * The season's rivalries for one collector: the rivals their claimed
 * runs met, and every other collector's claimed run that met them
 * (`outcome.rivals` names the run it raced). Newest first.
 */
export async function fetchRivalries(supabase: SupabaseClient, discordId: string, season: string): Promise<Rivalry[]> {
  const [mineResult, theirsResult] = await Promise.all([
    supabase.from("expedition_runs").select("discord_id, claimed_at, outcome").eq("season", season).eq("discord_id", discordId).not("claimed_at", "is", null).not("outcome->rivals", "is", null).limit(300),
    supabase.from("expedition_runs").select("discord_id, claimed_at, outcome").eq("season", season).neq("discord_id", discordId).not("claimed_at", "is", null).contains("outcome", { rivals: [{ who: discordId }] }).limit(300),
  ]);
  const rows = [...(((mineResult.data as RivalRunRow[] | null) ?? [])), ...(((theirsResult.data as RivalRunRow[] | null) ?? []))];
  const records = rows
    .filter((row) => row.claimed_at && Array.isArray(row.outcome?.rivals))
    .map((row) => ({ owner: row.discord_id, claimedAt: row.claimed_at!, rivals: row.outcome!.rivals! }));
  if (records.length === 0) return [];
  const names = await usernames(supabase, records.flatMap((record) => [record.owner, ...record.rivals.map((rival) => rival.who)]));
  return tallyRivalries(discordId, records, names);
}

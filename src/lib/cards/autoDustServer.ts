// Auto-dust, applied. Reads and writes the rule, and melts what the rule
// selects through the same door every manual dust uses — dust_card, one
// row at a time, after the same lock read — so the Eclipse refusal, the
// expedition and lineup locks, the seated-card guard and the ledger
// discipline all hold for an automatic dust exactly as for a tapped one.

import "server-only";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchAllCardSeasons } from "@/lib/cards/queries";
import { fetchInventory } from "@/lib/packs/queries";
import { ECLIPSE_FOIL_TYPE, patronDustValue } from "@/lib/packs/config";
import { patronActive } from "@/lib/patron/flames";
import { lockedInventoryIds } from "@/lib/trades/guards";
import { candidateFromInventory, keepGroupOf, normalizeRule, selectAutoDust, type AutoDustCandidate, type AutoDustRule } from "./autoDust";

type Service = ReturnType<typeof createBettingServiceClient>;

/** Rows a run may take in one go. A collection of thousands is dusted in
 *  runs, not in one request that outlives the function. */
export const AUTO_DUST_RUN_CAP = 200;

interface RuleRow {
  enabled: boolean;
  max_tier: string;
  max_overall: number;
  keep_copies: number;
  per_edition: boolean | null;
  on_rip: boolean;
  skip_foil: boolean;
  skip_signed: boolean;
  skip_finishes: boolean | null;
}

export async function fetchAutoDustRule(service: Service, discordId: string): Promise<AutoDustRule> {
  const { data } = await service
    .from("card_auto_dust")
    .select("enabled, max_tier, max_overall, keep_copies, per_edition, on_rip, skip_foil, skip_signed, skip_finishes")
    .eq("discord_id", discordId)
    .maybeSingle();
  const row = data as RuleRow | null;
  if (!row) return normalizeRule(null);
  return normalizeRule({
    enabled: row.enabled,
    maxTier: row.max_tier as AutoDustRule["maxTier"],
    maxOverall: row.max_overall,
    keepCopies: row.keep_copies,
    perEdition: row.per_edition === true,
    onRip: row.on_rip,
    skipFoil: row.skip_foil,
    skipSigned: row.skip_signed,
    // Null only on a row older than the column; the default is to keep.
    skipFinishes: row.skip_finishes !== false,
  });
}

export async function saveAutoDustRule(service: Service, discordId: string, rule: AutoDustRule): Promise<void> {
  const { error } = await service.from("card_auto_dust").upsert(
    {
      discord_id: discordId,
      enabled: rule.enabled,
      max_tier: rule.maxTier,
      max_overall: rule.maxOverall,
      keep_copies: rule.keepCopies,
      per_edition: rule.perEdition,
      on_rip: rule.onRip,
      skip_foil: rule.skipFoil,
      skip_signed: rule.skipSigned,
      skip_finishes: rule.skipFinishes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "discord_id" },
  );
  if (error) throw new Error(error.message);
}

export interface DustRunResult {
  dusted: number;
  value: number;
  skipped: number;
  balance: number | null;
  ids: number[];
}

interface DustRow {
  id: number;
  discord_id: string;
  season: string;
  tier: string;
  foil: boolean;
  foil_type: string | null;
  signed: boolean | null;
  mutation: string | null;
  shiny?: boolean | null;
  secret?: unknown;
  slab?: unknown;
}

/**
 * Melt these copies for this collector. Ownership is re-read here rather
 * than trusted; a copy that is locked, an Eclipse, or refused by the
 * database is skipped and counted, never fatal, so the rest of the run
 * goes through.
 */
export async function dustCopies(service: Service, discordId: string, ids: number[]): Promise<DustRunResult> {
  const wanted = [...new Set(ids)].slice(0, AUTO_DUST_RUN_CAP);
  if (wanted.length === 0) return { dusted: 0, value: 0, skipped: 0, balance: null, ids: [] };

  const { data, error } = await service
    .from("card_inventory")
    .select("id, discord_id, season, tier, foil, foil_type, signed, mutation, shiny:card->shiny, secret:card->secret, slab:card->slab")
    .in("id", wanted);
  if (error) throw new Error(error.message);
  const owned = ((data as DustRow[]) ?? []).filter((row) => row.discord_id === discordId);

  const seasons = [...new Set(owned.map((row) => row.season))];
  const lockedBySeason = new Map(
    await Promise.all(seasons.map(async (season) => [season, await lockedInventoryIds(service, discordId, season)] as const)),
  );
  const { data: profile } = await service.from("betting_profiles").select("patron_until").eq("discord_id", discordId).maybeSingle();
  const patron = patronActive((profile as { patron_until: string | null } | null)?.patron_until);

  let dusted = 0;
  let value = 0;
  let skipped = wanted.length - owned.length;
  let balance: number | null = null;
  const done: number[] = [];
  for (const row of owned) {
    // A mutated copy is skipped here as well as in the selection: the
    // selection reads the shelf, this reads the row under the RPC's lock.
    // A Secret and a slabbed copy are skipped the same way: the rarest
    // ordinary pull, and a copy its owner sealed on purpose, are not
    // things a rule nobody re-read should melt.
    if (lockedBySeason.get(row.season)?.has(row.id) || row.foil_type === ECLIPSE_FOIL_TYPE || row.mutation || row.secret || row.slab) {
      skipped += 1;
      continue;
    }
    const rowValue = patronDustValue(
      { tier: row.tier, foil: row.foil, foilType: row.foil_type, signed: row.signed === true, shiny: Boolean(row.shiny) },
      patron,
    );
    const { data: next, error: rpcError } = await service.rpc("dust_card", { p_user: discordId, p_inventory: row.id, p_value: rowValue });
    if (rpcError) {
      skipped += 1;
      continue;
    }
    dusted += 1;
    value += rowValue;
    balance = Number(next);
    done.push(row.id);
  }
  return { dusted, value, skipped, balance, ids: done };
}

/** Apply the collector's rule to their whole shelf, every season. */
export async function runAutoDustOnCollection(service: Service, discordId: string): Promise<DustRunResult & { remaining: number }> {
  const rule = await fetchAutoDustRule(service, discordId);
  if (!rule.enabled) return { dusted: 0, value: 0, skipped: 0, balance: null, ids: [], remaining: 0 };
  const seasons = await fetchAllCardSeasons(service);
  const candidates: AutoDustCandidate[] = [];
  for (const entry of seasons) {
    const rows = await fetchInventory(service, discordId, entry.season);
    candidates.push(...rows.map(candidateFromInventory));
  }
  const selected = selectAutoDust(candidates, rule);
  const result = await dustCopies(service, discordId, selected);
  return { ...result, remaining: Math.max(0, selected.length - result.ids.length - result.skipped) };
}

/**
 * Apply the collector's rule to a pack that just opened. The shelf behind
 * the pack counts toward the keep, so a fresh pull of a player already
 * kept is an extra. Returns what was taken, or null when the rule is off
 * for rips or took nothing.
 */
export async function autoDustPulls(
  service: Service,
  discordId: string,
  season: string,
  pulls: {
    inventoryId: number;
    slug: string;
    tier: string;
    overall: number;
    foil: boolean;
    foilType: string | null;
    signed: boolean;
    relic: boolean;
    editionWeek: string;
  }[],
): Promise<DustRunResult | null> {
  const rule = await fetchAutoDustRule(service, discordId);
  if (!rule.enabled || !rule.onRip || pulls.length === 0) return null;
  const slugs = [...new Set(pulls.map((pull) => pull.slug))];
  const newIds = new Set(pulls.map((pull) => pull.inventoryId));
  const { data } = await service
    .from("card_inventory")
    .select("id, slug, edition_week")
    .eq("discord_id", discordId)
    .eq("season", season)
    .in("slug", slugs);
  // Keyed the way selectAutoDust groups — per player, or per print when
  // the rule says so — or a per-edition rule would count last week's
  // print against this week's keep.
  const held = new Map<string, number>();
  for (const row of (data as { id: number; slug: string; edition_week: string }[] | null) ?? []) {
    if (newIds.has(row.id)) continue;
    const key = keepGroupOf({ slug: row.slug, editionWeek: row.edition_week }, rule);
    held.set(key, (held.get(key) ?? 0) + 1);
  }
  const candidates: AutoDustCandidate[] = pulls.map((pull) => ({
    id: pull.inventoryId,
    slug: pull.slug,
    tier: pull.tier,
    overall: pull.overall,
    foil: pull.foil,
    foilType: pull.foilType,
    signed: pull.signed,
    relic: pull.relic,
    editionWeek: pull.editionWeek,
  }));
  const selected = selectAutoDust(candidates, rule, held);
  if (selected.length === 0) return null;
  const result = await dustCopies(service, discordId, selected);
  return result.dusted > 0 ? result : null;
}

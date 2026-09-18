"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { getBettingUser } from "@/lib/betting/wallet";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { createServerSupabase } from "@/lib/supabase/server";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { cardPlayerKey } from "@/lib/cards/build";
import { validateSeasonEndCatalog } from "@/lib/season-end/collectibles";
import { fetchSeasonEndCatalog, fetchSeasonEndRelease, type SeasonEndOpeningMode } from "@/lib/season-end/release-queries";
import { DEFAULT_SEASON_END_RULES, rollSeasonEndPack, type SeasonEndPull, type SeasonEndRollRules } from "./season-end";

export type SeasonEndPullResult = SeasonEndPull & { inventoryId: number };

export type SeasonEndOpenPackResult =
  | {
      ok: true;
      cards: SeasonEndPullResult[];
      balance: number;
      openingId: string;
      releaseId: string;
      mode: SeasonEndOpeningMode;
      price: number;
      revealOrder: number[];
      autoDustProtected: true;
    }
  | { ok: false; error: string };

type OpeningRow = {
  opening_id: string;
  status: "pending" | "fulfilled" | "refunded";
  price: number;
  mode: SeasonEndOpeningMode;
  test_balance: number | null;
  outcome: SeasonEndPull[] | null;
};

function rand(): number {
  return randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
}

async function isStaff(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const tier = await fetchStaffTier(supabase);
  return tier.isAdmin || tier.isOwner;
}

async function fetchAutographs(): Promise<Map<string, string>> {
  const service = createBettingServiceClient();
  const { data, error } = await service.from("card_art_prefs").select("summoner_name, tag, signature").not("signature", "is", null);
  if (error) return new Map();
  return new Map(((data as Array<{ summoner_name: string; tag: string; signature: string | null }> | null) ?? [])
    .filter((row): row is { summoner_name: string; tag: string; signature: string } => Boolean(row.signature))
    .map((row) => [cardPlayerKey(row.summoner_name, row.tag), row.signature]));
}

function rulesFor(release: { signatureCalibration: Record<string, unknown> | null }): SeasonEndRollRules {
  const calibrated = Number(release.signatureCalibration?.calibratedPerCopyChance ?? 0);
  return { ...DEFAULT_SEASON_END_RULES, signatureChance: Number.isFinite(calibrated) ? calibrated : 0 };
}

function asOpening(value: unknown): OpeningRow | null {
  const row = (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | null;
  if (!row?.opening_id) return null;
  return {
    opening_id: String(row.opening_id),
    status: row.status as OpeningRow["status"],
    price: Number(row.price ?? 500),
    mode: row.mode as SeasonEndOpeningMode,
    test_balance: row.test_balance === null || row.test_balance === undefined ? null : Number(row.test_balance),
    outcome: decodeOutcome(row.outcome),
  };
}

function decodeOutcome(value: unknown): SeasonEndPull[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      design: row.payload as SeasonEndPull["design"],
      foil: row.foil === true,
      foilType: (row.foil_type as SeasonEndPull["foilType"]) ?? null,
      signed: row.signed === true,
      autograph: (row.autograph as string | null) ?? null,
      guaranteedFoil: row.guaranteed_foil === true,
    };
  });
}

async function fetchInventoryIds(openingId: string): Promise<number[]> {
  const service = createBettingServiceClient();
  const { data, error } = await service
    .from("season_end_inventory")
    .select("id")
    .eq("opening_id", openingId)
    .order("id", { ascending: true });
  if (error) return [];
  return ((data as Array<{ id: number }> | null) ?? []).map((row) => Number(row.id));
}

async function publicBalance(discordId: string, fallback: number): Promise<number> {
  const service = createBettingServiceClient();
  const { data } = await service.from("betting_profiles").select("balance").eq("discord_id", discordId).maybeSingle();
  return Number((data as { balance?: number } | null)?.balance ?? fallback);
}

function outcomeFor(pulls: SeasonEndPull[]): Array<Record<string, unknown>> {
  return pulls.map((pull) => ({
    design_id: pull.design.designId,
    kind: pull.design.kind,
    foil: pull.foil,
    foil_type: pull.foilType,
    signed: pull.signed,
    autograph: pull.autograph,
    payload: pull.design,
    guaranteed_foil: pull.guaranteedFoil,
  }));
}

function resultFromOpening(opening: OpeningRow, cards: SeasonEndPullResult[], balance: number, releaseId: string, mode: SeasonEndOpeningMode, price: number): SeasonEndOpenPackResult {
  return { ok: true, cards, balance, openingId: opening.opening_id, releaseId, mode, price, revealOrder: cards.map((card) => card.inventoryId), autoDustProtected: true };
}

export async function openSeasonEndPackAction(input: {
  league: "premier" | "academy";
  season: string;
  releaseId: string;
  mode: SeasonEndOpeningMode;
  requestId?: string;
}): Promise<SeasonEndOpenPackResult> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in to open a Season's End pack." };
  if (input.mode === "public" && !user.allowed) return { ok: false, error: "FPL Better members only." };
  if (input.mode === "admin_test" && !(await isStaff())) return { ok: false, error: "Admins only." };

  const service = createBettingServiceClient();
  const release = await fetchSeasonEndRelease(service, input.league, input.season, { publicOnly: input.mode === "public" });
  if (!release || release.id !== input.releaseId) return { ok: false, error: "That Season's End release is not available." };
  if (release.paused) return { ok: false, error: "Season's End purchases are paused." };
  if (input.mode === "public" && release.state !== "public") return { ok: false, error: "That release is not public yet." };
  if (input.mode === "admin_test" && release.state !== "admin_test") return { ok: false, error: "Put the release into admin test mode first." };

  const catalog = await fetchSeasonEndCatalog(service, release);
  if (!catalog) return { ok: false, error: "The release catalog is incomplete." };
  const validation = validateSeasonEndCatalog(catalog);
  if (!validation.ok || catalog.catalogHash !== release.catalogHash) return { ok: false, error: "The release catalog is not locked for opening." };

  const requestId = input.requestId ?? randomUUID();
  const { data: beginData, error: beginError } = await service.rpc("begin_season_end_opening", {
    p_request_id: requestId,
    p_user: user.discordId,
    p_release: release.id,
    p_mode: input.mode,
  });
  if (beginError) {
    if (/insufficient/i.test(beginError.message)) return { ok: false, error: "Insufficient balance." };
    return { ok: false, error: "That Season's End pack could not be started." };
  }
  const opening = asOpening(beginData);
  if (!opening) return { ok: false, error: "That Season's End opening could not be started." };
  if (opening.status === "refunded") return { ok: false, error: "That opening was refunded; please try again." };
  if (opening.status === "fulfilled" && opening.outcome) {
    const balance = input.mode === "public" ? await publicBalance(user.discordId, user.balance) : opening.test_balance ?? 0;
    const ids = await fetchInventoryIds(opening.opening_id);
    if (ids.length !== opening.outcome.length) return { ok: false, error: "That opening has incomplete inventory." };
    const cards = opening.outcome.map((pull, index) => ({ ...pull, inventoryId: ids[index] }));
    return resultFromOpening(opening, cards, balance, release.id, input.mode, opening.price);
  }

  const prepared = opening.outcome ?? rollSeasonEndPack(catalog, rand, await fetchAutographs(), rulesFor(release));
  const { data: preparedData, error: prepareError } = await service.rpc("prepare_season_end_opening", {
    p_opening: opening.opening_id,
    p_outcome: outcomeFor(prepared),
  });
  if (prepareError) {
    await service.rpc("refund_season_end_opening", { p_opening: opening.opening_id });
    return { ok: false, error: "That opening could not be prepared; you have not been charged." };
  }
  const committed = (Array.isArray(preparedData) ? preparedData[0] : preparedData) as { outcome?: unknown } | null;
  const committedOutcome = decodeOutcome(committed?.outcome) ?? prepared;
  const { data: fulfilled, error: fulfillError } = await service.rpc("fulfill_season_end_opening", { p_opening: opening.opening_id, p_outcome: outcomeFor(committedOutcome) });
  if (fulfillError) {
    const { error: refundError } = await service.rpc("refund_season_end_opening", { p_opening: opening.opening_id });
    if (refundError) console.error("season-end: refund failed", { openingId: opening.opening_id, fulfillError, refundError });
    return { ok: false, error: refundError ? "The opening failed and needs staff recovery." : "That opening failed; you have not been charged." };
  }
  const fulfilledRow = (Array.isArray(fulfilled) ? fulfilled[0] : fulfilled) as { card_ids?: unknown; minted?: boolean; outcome?: unknown } | null;
  const ids = Array.isArray(fulfilledRow?.card_ids) ? fulfilledRow.card_ids.map(Number) : [];
  if (ids.length !== committedOutcome.length) return { ok: false, error: "That opening returned an invalid fulfillment." };
  const cards = committedOutcome.map((pull, index) => ({ ...pull, inventoryId: ids[index] }));
  const balance = input.mode === "public" ? await publicBalance(user.discordId, user.balance - release.price) : Number((fulfilledRow as { test_balance?: number } | null)?.test_balance ?? opening.test_balance ?? 0);
  return resultFromOpening(opening, cards, balance, release.id, input.mode, release.price);
}

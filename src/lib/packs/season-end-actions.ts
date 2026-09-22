"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { getBettingUser } from "@/lib/betting/wallet";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { createServerSupabase } from "@/lib/supabase/server";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { validateSeasonEndCatalog } from "@/lib/season-end/collectibles";
import { fetchSeasonEndCatalog, fetchSeasonEndReleaseById, type SeasonEndOpeningMode } from "@/lib/season-end/release-queries";
import { rollSeasonEndPack, type SeasonEndPull, type SeasonEndRollRules } from "./season-end";
import { validateSeasonEndReleaseRules } from "@/lib/season-end/release";

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
  | { ok: false; error: string; code?: "pending" | "refunded" | "unavailable" | "invalid" };

type OpeningRow = {
  opening_id: string;
  status: "pending" | "fulfilled" | "refunded";
  price: number;
  mode: SeasonEndOpeningMode;
  test_balance: number | null;
  outcome: SeasonEndPull[] | null;
  signing_book: Array<{ playerKey: string; autograph: string }> | null;
  rules_payload: Record<string, unknown> | null;
};

function validUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function rand(): number {
  return randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
}

async function isStaff(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const tier = await fetchStaffTier(supabase);
  return tier.isAdmin || tier.isOwner;
}

function rulesFor(release: { signatureCalibration: Record<string, unknown> | null; rulesPayload: Record<string, unknown> }, frozenRules?: Record<string, unknown> | null): SeasonEndRollRules {
  const calibrated = Number(release.signatureCalibration?.calibratedPerCopyChance ?? 0);
  const frozen = frozenRules ?? release.rulesPayload;
  const rules: SeasonEndRollRules = {
    foilChance: Number(frozen.foilChance),
    slot34FamilyWeights: frozen.slot34FamilyWeights as SeasonEndRollRules["slot34FamilyWeights"],
    slot5FamilyWeights: frozen.slot5FamilyWeights as SeasonEndRollRules["slot5FamilyWeights"],
    guaranteedSlot: frozen.guaranteedSlot as 5,
    signatureChanceCap: Number(frozen.signatureChanceCap),
    foilTypeWeights: frozen.foilTypeWeights as SeasonEndRollRules["foilTypeWeights"],
    signatureChance: Number.isFinite(calibrated) ? calibrated : 0,
  };
  const errors = validateSeasonEndReleaseRules(rules);
  if (!Number.isFinite(rules.signatureChance) || rules.signatureChance < 0 || rules.signatureChance > rules.signatureChanceCap) errors.push("frozen signature chance is invalid");
  if (errors.length) throw new Error(`invalid frozen Season's End rules: ${errors.join("; ")}`);
  return rules;
}

function asOpening(value: unknown): OpeningRow | null {
  const row = (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | null;
  if (!row?.opening_id) return null;
  return {
    opening_id: String(row.opening_id),
    status: row.status as OpeningRow["status"],
    price: Number(row.price ?? 500),
    mode: row.mode as SeasonEndOpeningMode,
    test_balance: row.test_balance === null || row.test_balance === undefined
      ? row.test_balance_after === null || row.test_balance_after === undefined ? null : Number(row.test_balance_after)
      : Number(row.test_balance),
    outcome: decodeOutcome(row.outcome),
    signing_book: Array.isArray(row.signing_book) ? row.signing_book as Array<{ playerKey: string; autograph: string }> : null,
    rules_payload: row.rules_payload && typeof row.rules_payload === "object" ? row.rules_payload as Record<string, unknown> : null,
  };
}

async function existingOpening(input: { requestId: string; user: string; releaseId: string; mode: SeasonEndOpeningMode }): Promise<OpeningRow | null> {
  const service = createBettingServiceClient();
  const { data, error } = await service
    .from("season_end_openings")
    .select("opening_id, status, price, mode, test_balance_after, outcome, signing_book, rules_payload")
    .eq("request_id", input.requestId)
    .eq("discord_id", input.user)
    .eq("release_id", input.releaseId)
    .eq("mode", input.mode)
    .maybeSingle();
  if (error) throw new Error(`Season's End opening recovery read failed: ${error.message}`);
  return asOpening(data);
}

async function openingStatus(openingId: string): Promise<OpeningRow | null> {
  const service = createBettingServiceClient();
  const { data, error } = await service.from("season_end_openings").select("opening_id, status, price, mode, test_balance_after, outcome, signing_book, rules_payload").eq("opening_id", openingId).maybeSingle();
  if (error) return null;
  return asOpening(data);
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
    .select("id, slot_position")
    .eq("opening_id", openingId)
    .order("slot_position", { ascending: true });
  if (error) throw new Error(`Season's End opening inventory read failed: ${error.message}`);
  return ((data as Array<{ id: number; slot_position: number }> | null) ?? []).map((row) => Number(row.id));
}

async function publicBalance(discordId: string, fallback: number): Promise<number> {
  const service = createBettingServiceClient();
  const { data } = await service.from("betting_profiles").select("balance").eq("discord_id", discordId).maybeSingle();
  return Number((data as { balance?: number } | null)?.balance ?? fallback);
}

async function refundPendingOpening(openingId: string): Promise<{ error: string; code: "pending" | "refunded" }> {
  const service = createBettingServiceClient();
  const { error } = await service.rpc("refund_season_end_opening", { p_opening: openingId });
  const terminal = await openingStatus(openingId);
  if (!error && terminal?.status === "refunded") return { error: `Opening ${openingId} was refunded.`, code: "refunded" };
  return { error: `Opening ${openingId} is pending recovery; your charge has not been confirmed as refunded.`, code: "pending" };
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
  if (!input || (input.league !== "premier" && input.league !== "academy") || typeof input.season !== "string" || !validUuid(input.releaseId) || (input.mode !== "public" && input.mode !== "admin_test")) {
    return { ok: false, error: "That Season's End opening request is invalid." };
  }
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in to open a Season's End pack." };
  const requestId = input.requestId ?? randomUUID();
  if (!validUuid(requestId)) return { ok: false, error: "That Season's End request id is invalid." };
  const service = createBettingServiceClient();
  const recovered = await existingOpening({ requestId, user: user.discordId, releaseId: input.releaseId, mode: input.mode });
  if (input.mode === "admin_test" && !(await isStaff())) return { ok: false, error: "Admins only." };
  if (!recovered && input.mode === "public" && !user.allowed) return { ok: false, error: "FPL Better members only." };

  // A recovery reads the exact release revision by id and intentionally skips
  // current pause, active-season, and membership checks. A new purchase has
  // all three checks enforced before and inside the debit RPC.
  const release = await fetchSeasonEndReleaseById(service, input.releaseId, { publicOnly: !recovered && input.mode === "public" });
  if (!release || release.league !== input.league || release.season !== input.season) return { ok: false, error: "That Season's End release is not available." };
  if (!recovered && release.legacyContract) return { ok: false, error: "That legacy Season's End release is archived; new openings are disabled." };
  if (recovered?.status === "pending" && !recovered.outcome && release.legacyContract) return { ok: false, error: "That legacy opening needs staff recovery; its frozen release contract is incomplete.", code: "unavailable" };
  if (!recovered && release.paused) return { ok: false, error: "Season's End purchases are paused." };
  if (!recovered && input.mode === "public" && release.state !== "public") return { ok: false, error: "That release is not public yet." };
  if (!recovered && input.mode === "admin_test" && release.state !== "admin_test") return { ok: false, error: "Put the release into admin test mode first." };

  const needsCatalog = !recovered || (recovered.status === "pending" && !recovered.outcome);
  const catalog = needsCatalog ? await fetchSeasonEndCatalog(service, release) : null;
  if (needsCatalog) {
    if (!catalog) return { ok: false, error: "The release catalog is incomplete." };
    const validation = validateSeasonEndCatalog(catalog);
    if (!validation.ok || catalog.catalogHash !== release.catalogHash) return { ok: false, error: "The release catalog is not locked for opening." };
  }

  const { data: beginData, error: beginError } = await service.rpc("begin_season_end_opening", {
    p_request_id: requestId,
    p_user: user.discordId,
    p_release: release.id,
    p_mode: input.mode,
  });
  if (beginError) {
    if (/insufficient/i.test(beginError.message)) return { ok: false, error: "Insufficient balance." };
    if (/paused/i.test(beginError.message)) return { ok: false, error: "Season's End purchases are paused." };
    if (/request id was already used/i.test(beginError.message)) return { ok: false, error: "That purchase request belongs to another release." };
    return { ok: false, error: "That Season's End pack could not be started." };
  }
  const opening = asOpening(beginData);
  if (!opening) return { ok: false, error: "That Season's End opening could not be started." };
  if (opening.status === "refunded") return { ok: false, error: "That opening was refunded; choose Open another pack to start a new intent.", code: "refunded" };
  if (opening.status === "fulfilled" && opening.outcome) {
    const balance = input.mode === "public" ? await publicBalance(user.discordId, user.balance) : opening.test_balance ?? 0;
    const ids = await fetchInventoryIds(opening.opening_id);
    if (ids.length !== opening.outcome.length) return { ok: false, error: "That opening has incomplete inventory." };
    const cards = opening.outcome.map((pull, index) => ({ ...pull, inventoryId: ids[index] }));
    return resultFromOpening(opening, cards, balance, release.id, input.mode, opening.price);
  }

  if (!catalog && !opening.outcome) return { ok: false, error: `Opening ${opening.opening_id} is pending recovery; its frozen catalog is unavailable.`, code: "pending" };
  let prepared: SeasonEndPull[];
  try {
    const signingBook = new Map((opening.signing_book ?? release.signingBook).map((entry) => [entry.playerKey, entry.autograph] as const));
    prepared = opening.outcome ?? rollSeasonEndPack(catalog!, rand, signingBook, rulesFor(release, opening.rules_payload));
  } catch (caught) {
    console.error("season-end: frozen outcome preparation failed", { openingId: opening.opening_id, error: caught });
    return { ok: false, ...await refundPendingOpening(opening.opening_id) };
  }
  const { data: preparedData, error: prepareError } = await service.rpc("prepare_season_end_opening", {
    p_opening: opening.opening_id,
    p_outcome: outcomeFor(prepared),
  });
  if (prepareError) {
    return { ok: false, ...await refundPendingOpening(opening.opening_id) };
  }
  const committed = (Array.isArray(preparedData) ? preparedData[0] : preparedData) as { outcome?: unknown } | null;
  const committedOutcome = decodeOutcome(committed?.outcome) ?? prepared;
  const { data: fulfilled, error: fulfillError } = await service.rpc("fulfill_season_end_opening", { p_opening: opening.opening_id, p_outcome: outcomeFor(committedOutcome) });
  if (fulfillError) {
    const { error: refundError } = await service.rpc("refund_season_end_opening", { p_opening: opening.opening_id });
    if (refundError) console.error("season-end: refund failed", { openingId: opening.opening_id, fulfillError, refundError });
    const terminal = await openingStatus(opening.opening_id);
    if (terminal?.status === "fulfilled" && terminal.outcome) {
      const ids = await fetchInventoryIds(opening.opening_id);
      if (ids.length === terminal.outcome.length) return resultFromOpening(terminal, terminal.outcome.map((pull, index) => ({ ...pull, inventoryId: ids[index] })), await publicBalance(user.discordId, user.balance), release.id, input.mode, opening.price);
    }
    return !refundError && terminal?.status === "refunded"
      ? { ok: false, error: `Opening ${opening.opening_id} was refunded; choose Open another pack to start a new intent.`, code: "refunded" }
      : { ok: false, error: `Opening ${opening.opening_id} is pending recovery; retry the same intent.`, code: "pending" };
  }
  const fulfilledRow = (Array.isArray(fulfilled) ? fulfilled[0] : fulfilled) as { card_ids?: unknown; minted?: boolean; outcome?: unknown } | null;
  const ids = Array.isArray(fulfilledRow?.card_ids) ? fulfilledRow.card_ids.map(Number) : [];
  if (ids.length !== committedOutcome.length) return { ok: false, error: "That opening returned an invalid fulfillment." };
  const cards = committedOutcome.map((pull, index) => ({ ...pull, inventoryId: ids[index] }));
  const balance = input.mode === "public" ? await publicBalance(user.discordId, user.balance - release.price) : Number((fulfilledRow as { test_balance?: number } | null)?.test_balance ?? opening.test_balance ?? 0);
  return resultFromOpening(opening, cards, balance, release.id, input.mode, release.price);
}

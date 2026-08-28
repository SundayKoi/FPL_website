import { randomBytes } from "node:crypto";
import "server-only";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchInventoryByIds } from "@/lib/packs/queries";
import { easternDateOf } from "@/lib/packs/week";
import { GOLD, postCardsWebhook } from "@/lib/packs/announce";
import {
  EXPEDITION_TIERS,
  SQUAD_SIZE,
  rollOutcome,
  squadMeets,
  squadShine,
  type CardCopy,
  type ExpeditionOutcome,
  type ExpeditionTierKey,
} from "./config";

// The expedition core. Takes a bare Discord id ON TRUST, so it is
// `server-only` and never exported from a "use server" module: ./actions.ts
// establishes who is calling and composes these, exactly the split
// packs/open.ts and packs/actions.ts keep. Exporting launchExpeditionFor
// from an action file would let any browser send anybody's cards out.
//
// Everything the odds and the gates depend on comes from ./config.ts, and
// the atomicity comes from the two RPCs in
// supabase/migrations/20260901000001_card_expeditions.sql. This file is
// the seam: it reads the copies, applies the gates the UI also applies,
// rolls the outcome on a CSPRNG, and hands the result to the RPC that
// writes it once.

export type LaunchResult =
  | { ok: true; runId: number; resolvesAt: string }
  | { ok: false; error: string };

export type ClaimResult =
  | { ok: true; outcome: ExpeditionOutcome; bearerId: number | null; balance: number }
  | { ok: false; error: string };

/** What an unrecognized exception reads as — and what a launch that
 *  somehow returned no row reads as. */
const GENERIC_EXPEDITION_ERROR = "Something went wrong with that expedition.";

/**
 * `launch_expedition` / `claim_expedition`'s raw `raise exception` texts →
 * friendly copy. Same contract as friendlyOpenPackError and
 * friendlyDustError: never surface a raw Postgres error, and never let an
 * unrecognized one through as itself.
 *
 * `card is on expedition` is the deploy-lock TRIGGER's text rather than
 * either RPC's — it can reach a caller through any write that touches a
 * deployed copy, and it means the same thing to a player as the launch
 * RPC's own `card already deployed`, so it gets the same sentence.
 */
export function friendlyExpeditionError(message: string): string {
  if (/unknown tier/i.test(message)) return "That expedition doesn't exist.";
  if (/bad duration/i.test(message)) return "That expedition's length isn't valid.";
  if (/squad must be three distinct cards/i.test(message)) return "An expedition takes exactly three different cards.";
  // The tier slot, ahead of the daily limit the same way the RPC checks
  // them: "your Legend Hunt is still out" sends someone to the raid,
  // "you're done for today" sends them to bed.
  if (/tier already out/i.test(message)) {
    return "That expedition is already out — bring it home before you send another.";
  }
  if (/daily expedition limit/i.test(message)) {
    return "You've sent out every expedition you get today — come back tomorrow.";
  }
  if (/card not owned/i.test(message)) return "Those cards aren't yours.";
  if (/card already deployed|card is on expedition/i.test(message)) {
    return "One of those cards is already out on an expedition.";
  }
  if (/already claimed/i.test(message)) return "That expedition has already been claimed.";
  if (/expedition still out/i.test(message)) return "That squad is still out — check back soon.";
  if (/unknown run/i.test(message)) return "That expedition no longer exists.";
  if (/unknown user/i.test(message)) return "Account not found — try signing in again.";
  return GENERIC_EXPEDITION_ERROR;
}

/** The roll's randomness. CSPRNG, not Math.random: V8's PRNG state is
 *  recoverable from observed outputs, and an expedition pays real betting
 *  dollars. Six bytes over 2^48 gives a uniform [0,1) with more than
 *  enough resolution for the payout tables — the same line packs/open.ts
 *  rips packs with. */
const expeditionRand = () => randomBytes(6).readUIntBE(0, 6) / 2 ** 48;

/**
 * Sends three owned copies out on `tier`.
 *
 * The copies are read BEFORE anything is written, for three reasons that
 * all have to happen first: to prove the caller owns them, to compute the
 * shine the payout and the gate both read, and to learn which season they
 * belong to. The gate (`squadMeets`) is applied here as well as in the UI
 * — a disabled button has never stopped anybody — and the RPC re-checks
 * ownership, the double-deploy and the daily limit under a row lock, which
 * is the part a client can't race.
 */
export async function launchExpeditionFor(
  discordId: string,
  tier: ExpeditionTierKey,
  squadIds: number[],
): Promise<LaunchResult> {
  const def = EXPEDITION_TIERS[tier];
  if (!def) return { ok: false, error: friendlyExpeditionError("unknown tier") };

  // Shape first, so a malformed squad never costs a round trip. `distinct`
  // matters as much as the count: three of the same id would satisfy
  // length and then ask the database to deploy one card three times.
  const squad = Array.isArray(squadIds) ? squadIds.filter((id) => Number.isInteger(id)) : [];
  if (squad.length !== SQUAD_SIZE || new Set(squad).size !== SQUAD_SIZE) {
    return { ok: false, error: friendlyExpeditionError("squad must be three distinct cards") };
  }

  const service = createBettingServiceClient();
  // Scoped to this owner inside the query, so a short result is always
  // "you don't own all three" and never "you own two of these".
  const copies = await fetchInventoryByIds(service, discordId, squad);
  if (copies.length !== SQUAD_SIZE) return { ok: false, error: friendlyExpeditionError("card not owned") };

  // Expeditions are league-agnostic — the run is stamped with the season
  // its cards came from rather than with whichever league's page launched
  // it. A squad straddling two of them has no one season to be stamped
  // with, and the run log (fetchRuns) is a per-season read. The daily
  // limit is NOT: launch_expedition counts a day's runs without a season
  // filter, so the cap is one collector's cap across both leagues.
  const seasons = new Set(copies.map((copy) => copy.season));
  if (seasons.size !== 1) return { ok: false, error: "Squad cards must come from one league." };
  const season = [...seasons][0];

  const gate = squadMeets(tier, copies);
  // Every reason at once, the way squadMeets reports them: a squad short
  // of two things should hear both rather than being sent back twice.
  if (!gate.ok) return { ok: false, error: gate.reasons.join(" ") };

  const { data, error } = await service.rpc("launch_expedition", {
    p_user: discordId,
    p_season: season,
    p_tier: tier,
    p_squad: squad,
    p_shine: squadShine(copies),
    p_hours: def.durationHours,
  });
  if (error) return { ok: false, error: friendlyExpeditionError(error.message) };

  const row = (Array.isArray(data) ? data[0] : data) as { run_id: number; resolves_at: string } | null;
  if (!row) return { ok: false, error: GENERIC_EXPEDITION_ERROR };
  return { ok: true, runId: Number(row.run_id), resolvesAt: row.resolves_at };
}

interface RunRow {
  id: number;
  season: string;
  tier: ExpeditionTierKey;
  squad: number[];
  shine: number;
  started_at: string;
  resolves_at: string;
  claimed_at: string | null;
}

/**
 * Brings a finished squad home: rolls the outcome, banks it, and — for the
 * one result rare enough to be news — tells the cards channel.
 *
 * The roll happens HERE and the RPC writes it once, which is the whole
 * anti-reroll design: `claimed_at` is the lock, so a second claim of the
 * same run raises rather than rolling again. The pre-checks below are
 * courtesy (a clear message instead of a translated exception); the RPC
 * re-checks both under `for update`, which is what a double-click races.
 */
export async function claimExpeditionFor(discordId: string, runId: number): Promise<ClaimResult> {
  if (!Number.isInteger(runId)) return { ok: false, error: friendlyExpeditionError("unknown run") };

  const service = createBettingServiceClient();
  const { data, error } = await service
    .from("expedition_runs")
    .select("id, season, tier, squad, shine, started_at, resolves_at, claimed_at")
    .eq("id", runId)
    .eq("discord_id", discordId)
    .maybeSingle();
  if (error) return { ok: false, error: "Couldn't read that expedition — try again." };
  const run = data as RunRow | null;
  if (!run) return { ok: false, error: friendlyExpeditionError("unknown run") };
  if (run.claimed_at) return { ok: false, error: friendlyExpeditionError("already claimed") };
  if (new Date(run.resolves_at).getTime() > Date.now()) {
    return { ok: false, error: friendlyExpeditionError("expedition still out") };
  }

  const squad = (run.squad ?? []).map(Number);
  // Only the roles are wanted (the brief), and the shine was frozen into
  // the row at launch — re-deriving it here would let a card signed or
  // re-graded mid-run change a payout the player already committed to.
  const copies: CardCopy[] = await fetchInventoryByIds(service, discordId, squad);
  // A deployed copy cannot be melted or traded away — card_inventory_
  // expedition_guard refuses both while the run is unclaimed — so all
  // three are still there and still this caller's, and a short read is
  // ALWAYS a failed query (fetchInventoryByIds fails soft to []) or
  // corruption, never a legitimate state. Rolling anyway would quietly
  // cost a real payout its 20% brief bonus, because briefHit is a
  // `copies.some(...)` over roles that an empty list can only answer
  // "no". Refuse instead: nothing has been written, claimed_at is
  // untouched, and the run stays claimable for the retry.
  if (copies.length !== squad.length) {
    return { ok: false, error: "Couldn't read the squad — try the claim again." };
  }

  // THE LAUNCH DAY'S BRIEF, in Eastern time — the calendar the whole card
  // economy keeps (open_daily_pack, launch_expedition's daily limit). The
  // player picked this squad against the brief that was posted when they
  // sent it out; scoring a 48-hour Legend Hunt against whatever the board
  // says two days later would make the bonus a lottery on the return time
  // instead of a reason to swap a card.
  const dateIso = easternDateOf(new Date(run.started_at));
  const outcome = rollOutcome(run.tier, run.shine, copies, dateIso, expeditionRand);

  // Which copy wears the mark. Uniform over the squad and drawn AFTER the
  // outcome, so the mark's odds and its bearer stay independent — no card
  // is luckier than the two beside it. `min` is for the theoretical rand()
  // === 1 that a [0,1) generator never produces.
  const bearerId = outcome.mark
    ? squad[Math.min(squad.length - 1, Math.floor(expeditionRand() * squad.length))] ?? null
    : null;

  const { data: claimData, error: claimError } = await service.rpc("claim_expedition", {
    p_user: discordId,
    p_run: runId,
    p_grade: outcome.grade,
    // Never null: rollOutcome always returns numbers, and the RPC's guards
    // are permissive about nulls rather than protective.
    p_dollars: outcome.dollars,
    p_comp: outcome.comp,
    p_mark: outcome.mark,
    p_bearer: bearerId,
  });
  if (claimError) return { ok: false, error: friendlyExpeditionError(claimError.message) };
  const balanceRow = (Array.isArray(claimData) ? claimData[0] : claimData) as { balance: number } | null;

  // The rarest result in the feature, and the only one worth a ping. Best
  // effort, after the write: the dollars and the mark are already
  // committed, and a Discord outage must never fail a claim that paid.
  if (run.tier === "legend" && outcome.grade === "jackpot") {
    try {
      await postCardsWebhook({
        title: "Legend Hunt — jackpot",
        description: `<@${discordId}>'s Legend Hunt struck gold: ${outcome.dollars} dollars${outcome.comp ? ", a free pack" : ""}${outcome.mark ? ", and a card came back wearing the Legend Finish" : ""}.`,
        color: GOLD,
      });
    } catch (announceError) {
      console.error("expeditions: legend jackpot announcement failed", announceError);
    }
  }

  return { ok: true, outcome, bearerId, balance: Number(balanceRow?.balance ?? 0) };
}

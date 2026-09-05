import { randomBytes } from "node:crypto";
import "server-only";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchInventoryByIds } from "@/lib/packs/queries";
import { easternDateOf, mondayOf } from "@/lib/packs/week";
import { fetchEditionCards } from "@/lib/cards/queries";
import { GOLD, LIVE_RED, postCardsWebhook } from "@/lib/packs/announce";
import { patronActive } from "@/lib/patron/flames";
import {
  ECHO_CHANCE,
  EXPEDITION_TIERS,
  INSURANCE_FEE,
  MERCHANT_DOLLARS,
  SQUAD_SIZE,
  SURGE_BONUS,
  ransomFor,
  rollOutcome,
  squadMeets,
  squadShine,
  type CardCopy,
  type ExpeditionOutcome,
  type ExpeditionTierKey,
} from "./config";
import { fetchFixturesSince, fetchPolicyUsed, fetchStrangersHolds, hasTrail, mapRun, type ExpeditionRun } from "./queries";
import { echoPool, surgeTeams, teamsPlayingOn } from "./matchday";
import { STORM_HOURS, STRANDED_BOUNTY, encountersFor, latestJournalLine } from "./journal";
import {
  choiceAllowed,
  choiceSheet,
  forkViews,
  openFork,
  resolveRoute,
  type ForkChoice,
  type RecordedChoice,
  type RouteResult,
} from "./routes";

// The expedition core. Takes a bare Discord id ON TRUST, so it is
// `server-only` and never exported from a "use server" module: ./actions.ts
// establishes who is calling and composes these, exactly the split
// packs/open.ts and packs/actions.ts keep. Exporting launchExpeditionFor
// from an action file would let any browser send anybody's cards out.
//
// Everything the odds and the gates depend on comes from ./config.ts and
// ./routes.ts, and the atomicity comes from the RPCs in
// supabase/migrations/20260914000001_expedition_routes.sql. This file is
// the seam: it reads the copies, applies the gates the UI also applies,
// rolls the outcome on a CSPRNG, and hands the result to the RPC that
// writes it once.

const DAY_MS = 24 * 60 * 60 * 1000;

export type LaunchResult =
  | { ok: true; runId: number; resolvesAt: string; fee: number; freePolicy: boolean }
  | { ok: false; error: string };

export interface LaunchOptions {
  /** Buy the policy: lost becomes wounded, dead becomes lost. Free once a
   *  week for a patron; INSURANCE_FEE otherwise. */
  insured?: boolean;
  /** A Rescue's hold id, or an Exorcism's card id. */
  target?: number | null;
}

export type ClaimResult =
  | {
      ok: true;
      outcome: ExpeditionOutcome;
      route: RouteResult;
      bearerId: number | null;
      balance: number;
      fragments: number;
      /** The base dollars the forks multiplied. */
      baseDollars: number;
      /** The trail's beats that paid: the merchant's flat, and a stranger's
       *  card carried home for a bounty. */
      merchant: number;
      stranded: { holdId: number; bounty: number } | null;
      /** The teams that played on the launch day and surged the payout. */
      surge: string[];
      /** A moment's echo: the copy the route dropped, already on the shelf. */
      echo: { inventoryId: number; slug: string; playerName: string; moment: number } | null;
    }
  | { ok: false; error: string };

export type DecideResult = { ok: true; closesAt: string } | { ok: false; error: string };

export type RansomResult = { ok: true; balance: number; paid: number } | { ok: false; error: string };

/** What an unrecognized exception reads as — and what a launch that
 *  somehow returned no row reads as. */
const GENERIC_EXPEDITION_ERROR = "Something went wrong with that expedition.";

/**
 * The RPCs' raw `raise exception` texts → friendly copy. Same contract as
 * friendlyOpenPackError and friendlyDustError: never surface a raw
 * Postgres error, and never let an unrecognized one through as itself.
 *
 * `card is on expedition` is the deploy-lock TRIGGER's text rather than
 * any RPC's — it can reach a caller through any write that touches a
 * deployed (or lost) copy, and it means the same thing to a player as the
 * launch RPC's own `card already deployed`, so it gets the same sentence.
 */
export function friendlyExpeditionError(message: string): string {
  if (/unknown tier/i.test(message)) return "That expedition doesn't exist.";
  if (/bad duration/i.test(message)) return "That expedition's length isn't valid.";
  if (/bad forks|bad fee|bad fragments/i.test(message)) return "That expedition's setup isn't valid.";
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
  if (/card is wounded/i.test(message)) return "One of those cards is wounded and benched.";
  if (/card is one of one/i.test(message)) return "A one-of-one can't go on a route where it could be lost.";
  if (/card is cursed/i.test(message)) return "That card is Cursed — it can't change hands for a week.";
  if (/card is not afflicted/i.test(message)) return "That card has nothing to exorcise.";
  if (/target not in squad|target not wanted|cleansed not the target/i.test(message)) {
    return "The card to cleanse has to be in the squad.";
  }
  if (/no such lost card/i.test(message)) return "That card isn't lost — or it's already home.";
  if (/not enough fragments|fragments not wanted/i.test(message)) return "The Legendary route takes three map fragments.";
  if (/policy already used/i.test(message)) return "This week's free policy is already spent.";
  if (/policy is a patron perk|policy without insurance/i.test(message)) return "The free policy is a patron perk.";
  if (/insufficient balance/i.test(message)) return "You can't cover the fee.";
  if (/bad ransom/i.test(message)) return "That ransom didn't add up — refresh and try again.";
  if (/already claimed/i.test(message)) return "That expedition has already been claimed.";
  if (/expedition still out/i.test(message)) return "That squad is still out — check back soon.";
  if (/unknown run/i.test(message)) return "That expedition no longer exists.";
  if (/unknown user/i.test(message)) return "Account not found — try signing in again.";
  if (/unknown choice/i.test(message)) return "That isn't a choice at this fork.";
  if (/no such fork/i.test(message)) return "There's no fork there.";
  if (/fork already decided/i.test(message)) return "That fork has already been answered.";
  if (/fork not open/i.test(message)) return "The squad hasn't reached that fork yet.";
  if (/fork closed/i.test(message)) return "Too late — the squad took the safe way when nobody answered.";
  // A guard the PLAYER cannot have caused. It fired for real once: the
  // claim's payout ceiling was the legend jackpot's base rather than its
  // maximum, so every bonused jackpot was refused as a generic "something
  // went wrong" — and since rollOutcome re-rolls on retry, clicking again
  // paid a lower grade. Named here so a repeat says what it is, and so
  // nobody is told to try again in a way that costs them the roll.
  if (/payout out of range|fate beyond route|mutation beyond route|fate not in squad|fate repeated|unknown fate|unknown mutation|bad bench|bad fates|rescue needs a verdict|no such stranded card|bad bounty/i.test(message)) {
    return "That result didn't add up, so nothing was written — don't retry, tell staff. Your squad is still safe.";
  }
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
 * ownership, the double-deploy, the bench, the consent rule, the fee and
 * the daily limit under a row lock, which is the part a client can't race.
 */
export async function launchExpeditionFor(
  discordId: string,
  tier: ExpeditionTierKey,
  squadIds: number[],
  options: LaunchOptions = {},
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
  const target = options.target ?? null;
  if (def.target !== "none" && (target === null || !Number.isInteger(target))) {
    return { ok: false, error: def.target === "lost" ? "Pick the lost card to go after." : "Pick the card to cleanse." };
  }
  if (def.target === "afflicted" && !squad.includes(target!)) {
    return { ok: false, error: friendlyExpeditionError("target not in squad") };
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

  const gate = squadMeets(tier, copies, new Date());
  // Every reason at once, the way squadMeets reports them: a squad short
  // of two things should hear both rather than being sent back twice.
  if (!gate.ok) return { ok: false, error: gate.reasons.join(" ") };

  if (def.target === "afflicted") {
    const afflicted = copies.find((copy) => copy.id === target);
    const key = afflicted?.card?.mutation?.key;
    if (key !== "haunted" && key !== "cursed") return { ok: false, error: friendlyExpeditionError("card is not afflicted") };
  }

  // Insurance: a patron's first policy of the Eastern week is free, claimed
  // by the RPC by primary-key insert so two launches can't both be free.
  const insured = options.insured === true && def.risk !== "none";
  let freePolicy = false;
  let policyWeek: string | null = null;
  if (insured) {
    const { data: profile } = await service
      .from("betting_profiles")
      .select("patron_until")
      .eq("discord_id", discordId)
      .maybeSingle();
    const patron = patronActive((profile as { patron_until?: string | null } | null)?.patron_until);
    if (patron) {
      const week = mondayOf(new Date());
      if (!(await fetchPolicyUsed(service, discordId, week))) {
        freePolicy = true;
        policyWeek = week;
      }
    }
  }
  const fee = def.fee + (insured && !freePolicy ? INSURANCE_FEE : 0);

  const { data, error } = await service.rpc("launch_expedition", {
    p_user: discordId,
    p_season: season,
    p_tier: tier,
    p_squad: squad,
    p_shine: squadShine(copies),
    p_hours: def.durationHours,
    p_forks: def.forks,
    p_insured: insured,
    p_fee: fee,
    p_fragments: def.fragments,
    p_target: target,
    p_policy_week: policyWeek,
  });
  if (error) return { ok: false, error: friendlyExpeditionError(error.message) };

  const row = (Array.isArray(data) ? data[0] : data) as { run_id: number; resolves_at: string } | null;
  if (!row) return { ok: false, error: GENERIC_EXPEDITION_ERROR };
  return { ok: true, runId: Number(row.run_id), resolvesAt: row.resolves_at, fee, freePolicy };
}

const RUN_COLUMNS = "id, tier, squad, shine, started_at, resolves_at, outcome, claimed_at, forks, choices, insured, target, fee";

async function readRun(discordId: string, runId: number): Promise<{ run: ExpeditionRun | null; error: boolean }> {
  const service = createBettingServiceClient();
  const { data, error } = await service
    .from("expedition_runs")
    .select(RUN_COLUMNS)
    .eq("id", runId)
    .eq("discord_id", discordId)
    .maybeSingle();
  if (error) return { run: null, error: true };
  return { run: data ? mapRun(data as Parameters<typeof mapRun>[0]) : null, error: false };
}

/**
 * Answers a fork. The window and the "once" are the RPC's to check under
 * the row lock; what is checked HERE is whether this squad can make this
 * choice at all (a favour needs a signed card, a light a foil and a dark
 * fork, a rally one roster), because the RPC only knows the five words.
 */
export async function decideForkFor(
  discordId: string,
  runId: number,
  index: number,
  choice: ForkChoice,
): Promise<DecideResult> {
  if (!Number.isInteger(runId) || !Number.isInteger(index)) return { ok: false, error: friendlyExpeditionError("no such fork") };
  const { run, error } = await readRun(discordId, runId);
  if (error) return { ok: false, error: "Couldn't read that expedition — try again." };
  if (!run || run.tier === "lost") return { ok: false, error: friendlyExpeditionError("unknown run") };
  if (run.claimedAt) return { ok: false, error: friendlyExpeditionError("already claimed") };
  const open = openFork(run, new Date());
  if (!open || open.index !== index) {
    const view = forkViews(run, new Date())[index];
    return { ok: false, error: friendlyExpeditionError(!view ? "no such fork" : view.status === "decided" ? "fork already decided" : view.status === "pending" ? "fork not open" : "fork closed") };
  }

  const service = createBettingServiceClient();
  const copies = await fetchInventoryByIds(service, discordId, run.squad);
  if (copies.length !== run.squad.length) return { ok: false, error: "Couldn't read the squad — try again." };
  const earlier = choiceSheet(run.forks, run.choices);
  if (!choiceAllowed(run.tier, index, choice, copies, earlier)) {
    return { ok: false, error: "This squad can't make that choice here." };
  }

  const { data, error: rpcError } = await service.rpc("decide_expedition_fork", {
    p_user: discordId,
    p_run: runId,
    p_index: index,
    p_choice: choice,
  });
  if (rpcError) return { ok: false, error: friendlyExpeditionError(rpcError.message) };
  const row = (Array.isArray(data) ? data[0] : data) as { closes_at: string } | null;
  return { ok: true, closesAt: row?.closes_at ?? open.closesAt.toISOString() };
}

/**
 * Brings a finished squad home: rolls the outcome, walks the route, banks
 * it all, and — for the results rare enough to be news — tells the cards
 * channel.
 *
 * The roll happens HERE and the RPC writes it once, which is the whole
 * anti-reroll design: `claimed_at` is the lock, so a second claim of the
 * same run raises rather than rolling again. The pre-checks below are
 * courtesy (a clear message instead of a translated exception); the RPC
 * re-checks both under `for update`, which is what a double-click races.
 */
export async function claimExpeditionFor(discordId: string, runId: number): Promise<ClaimResult> {
  if (!Number.isInteger(runId)) return { ok: false, error: friendlyExpeditionError("unknown run") };

  const { run, error } = await readRun(discordId, runId);
  if (error) return { ok: false, error: "Couldn't read that expedition — try again." };
  if (!run || run.tier === "lost") return { ok: false, error: friendlyExpeditionError("unknown run") };
  if (run.claimedAt) return { ok: false, error: friendlyExpeditionError("already claimed") };
  if (new Date(run.resolvesAt).getTime() > Date.now()) {
    return { ok: false, error: friendlyExpeditionError("expedition still out") };
  }
  const tier = run.tier;

  const service = createBettingServiceClient();
  const squad = run.squad;
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
  const dateIso = easternDateOf(new Date(run.startedAt));
  const base = rollOutcome(tier, run.shine, copies, dateIso, expeditionRand);

  // Which copy wears the mark. Uniform over the squad and drawn AFTER the
  // outcome, so the mark's odds and its bearer stay independent — no card
  // is luckier than the two beside it. `min` is for the theoretical rand()
  // === 1 that a [0,1) generator never produces.
  const bearerId = base.mark
    ? squad[Math.min(squad.length - 1, Math.floor(expeditionRand() * squad.length))] ?? null
    : null;

  // The route: what the forks made of it and what the squad looks like.
  const route = resolveRoute(
    {
      tier,
      forks: run.forks,
      copies,
      choices: choiceSheet(run.forks, run.choices),
      insured: run.insured,
      grade: base.grade,
      target: run.target,
      now: new Date(),
    },
    expeditionRand,
  );
  // The trail's beats. The merchant is a flat on top of the multiplied
  // dollars; the stranded card is another collector's open hold, the
  // oldest one, released by the RPC with a bounty — and only if one exists
  // when the squad gets home, or the journal's line stays a story.
  // Nothing below applies to a squad that launched before the trail
  // existed (hasTrail): it pays and comes home exactly as it set out.
  const trail = hasTrail(run);
  const encounters = encountersFor({ id: run.id, tier, startedAt: run.startedAt, resolvesAt: run.resolvesAt, forks: run.forks, rules: run.rules });
  const merchant = encounters.some((entry) => entry.key === "merchant") ? MERCHANT_DOLLARS : 0;
  let stranded: { holdId: number; bounty: number } | null = null;
  if (encounters.some((entry) => entry.key === "stranded")) {
    const [hold] = await fetchStrangersHolds(service, discordId);
    if (hold) stranded = { holdId: hold.holdId, bounty: STRANDED_BOUNTY };
  }
  // Match day: the fixtures of the LAUNCH day, on the same Eastern
  // calendar as the brief — a squad keeps the surge it left with. Read
  // from a day before the launch so a fixture at midnight UTC (8pm
  // Eastern the evening before) is in the window.
  const fixtures = trail ? await fetchFixturesSince(service, new Date(Date.parse(run.startedAt) - DAY_MS).toISOString()) : [];
  const surge = surgeTeams(copies, teamsPlayingOn(fixtures, dateIso));
  const dollars = Math.round(base.dollars * route.lootMultiplier * (surge.length > 0 ? 1 + SURGE_BONUS : 1)) + merchant;
  const outcome: ExpeditionOutcome = { ...base, dollars };
  // The echo: each moment on the squad rolls once, after everything else
  // so the scripted draws above are undisturbed on a squad without one.
  // The copy comes from the archived edition of the moment's week; a week
  // that was never archived has nothing to echo, and the roll is lost.
  let echo: { slug: string; week: string; moment: number; playerName: string } | null = null;
  for (const copy of trail ? copies : []) {
    const moment = copy.card?.moment;
    if (!moment || echo) continue;
    if (expeditionRand() >= ECHO_CHANCE) continue;
    const pool = echoPool(moment, await fetchEditionCards(service, copy.season, moment.weekStart));
    if (pool.length === 0) continue;
    const pick = pool[Math.min(pool.length - 1, Math.floor(expeditionRand() * pool.length))];
    echo = { slug: pick.slug, week: moment.weekStart, moment: copy.id, playerName: pick.name };
  }
  // A dead card cannot wear the mark.
  const dead = new Set(route.fates.filter((fate) => fate.fate === "dead").map((fate) => fate.id));
  const bearer = bearerId !== null && dead.has(bearerId) ? null : bearerId;

  const { data: claimData, error: claimError } = await service.rpc("resolve_expedition", {
    p_user: discordId,
    p_run: runId,
    p_outcome: {
      grade: outcome.grade,
      // Never null: rollOutcome always returns numbers, and the RPC's guards
      // are permissive about nulls rather than protective.
      dollars,
      baseDollars: base.dollars,
      comp: outcome.comp,
      mark: bearer === null ? null : outcome.mark,
      bearer,
      briefHit: outcome.briefHit,
      lootMultiplier: route.lootMultiplier,
      pushes: route.pushes,
      fragments: route.fragments,
      fates: route.fates.map((fate) => ({
        id: fate.id,
        fate: fate.fate,
        mutation: fate.mutation,
        ...(fate.woundedUntil ? { until: fate.woundedUntil } : {}),
      })),
      events: route.events,
      rescued: route.rescued,
      cleansed: route.cleansed,
      merchant,
      surge,
      ...(stranded ? { stranded: stranded.holdId, bounty: stranded.bounty } : {}),
      ...(echo ? { echo: { slug: echo.slug, week: echo.week, moment: echo.moment } } : {}),
    },
  });
  if (claimError) {
    // The raw message, always: the friendly text is deliberately vague and
    // an unrecognised failure is exactly the case somebody will have to
    // diagnose from a screenshot.
    console.error("expeditions: claim rejected", { discordId, runId, message: claimError.message });
    return { ok: false, error: friendlyExpeditionError(claimError.message) };
  }
  const row = (Array.isArray(claimData) ? claimData[0] : claimData) as { balance: number; fragments: number; echo_id?: number | null } | null;

  // The news, best effort and AFTER the write: the dollars and the stamps
  // are already committed, and a Discord outage must never fail a claim
  // that paid.
  await announceClaim(discordId, tier, outcome, route, copies);
  if (stranded) {
    // The channel hears a stranger's card is home — from a run that was
    // not theirs; the owner finds it on their shelf.
    try {
      await postCardsWebhook({
        title: "A lost card was carried home",
        description: `<@${discordId}>'s squad found a stranded card on the ${EXPEDITION_TIERS[tier].label} and brought it home for a ${stranded.bounty} bounty. Its owner will find it on their shelf, wounded but back.`,
        color: GOLD,
      });
    } catch (announceError) {
      console.error("expeditions: stranded announcement failed", announceError);
    }
  }

  if (echo && row?.echo_id) {
    try {
      await postCardsWebhook({
        title: "A moment echoed",
        description: `<@${discordId}>'s squad carried a moment out on the ${EXPEDITION_TIERS[tier].label}, and it echoed: a copy of ${echo.playerName} from that game came home with them.`,
        color: GOLD,
      });
    } catch (announceError) {
      console.error("expeditions: echo announcement failed", announceError);
    }
  }

  return {
    ok: true,
    outcome,
    route,
    bearerId: bearer,
    surge,
    echo: echo && row?.echo_id ? { inventoryId: Number(row.echo_id), slug: echo.slug, playerName: echo.playerName, moment: echo.moment } : null,
    balance: Number(row?.balance ?? 0),
    fragments: Number(row?.fragments ?? 0),
    baseDollars: base.dollars,
    merchant,
    stranded,
  };
}

async function announceClaim(
  discordId: string,
  tier: ExpeditionTierKey,
  outcome: ExpeditionOutcome,
  route: RouteResult,
  copies: CardCopy[],
): Promise<void> {
  const nameOf = (id: number) => copies.find((copy) => copy.id === id)?.playerName ?? `#${id}`;
  const embeds: { title: string; description: string; color: number }[] = [];
  if (tier === "legend" && outcome.grade === "jackpot") {
    embeds.push({
      title: "Legend Hunt — jackpot",
      description: `<@${discordId}>'s Legend Hunt struck gold: ${outcome.dollars} dollars${outcome.comp ? ", a free pack" : ""}${outcome.mark ? ", and a card came back wearing the Legend Finish" : ""}.`,
      color: GOLD,
    });
  }
  const voidtouched = route.fates.filter((fate) => fate.mutation === "voidtouched");
  if (voidtouched.length > 0) {
    embeds.push({
      title: "Back from the Legendary route — Voidtouched",
      description: `<@${discordId}>'s ${voidtouched.map((fate) => nameOf(fate.id)).join(" and ")} went somewhere the map does not show, and came home Voidtouched.`,
      color: GOLD,
    });
  }
  const dead = route.fates.filter((fate) => fate.fate === "dead");
  if (dead.length > 0) {
    embeds.push({
      title: "Lost on the Legendary route",
      description: `<@${discordId}>'s ${dead.map((fate) => nameOf(fate.id)).join(" and ")} did not come home. ${dead.length === 1 ? "It rests" : "They rest"} in the graveyard.`,
      color: LIVE_RED,
    });
  }
  for (const embed of embeds) {
    try {
      await postCardsWebhook(embed);
    } catch (announceError) {
      console.error("expeditions: announcement failed", announceError);
    }
  }
}

/** Buys a lost card back. The price is read off the card here and range-
 *  checked by the RPC; the hold is released and the card comes home
 *  wounded, exactly as a rescue would bring it. */
export async function ransomLostCardFor(discordId: string, holdId: number): Promise<RansomResult> {
  if (!Number.isInteger(holdId)) return { ok: false, error: friendlyExpeditionError("no such lost card") };
  const { run: hold, error } = await readRun(discordId, holdId);
  if (error) return { ok: false, error: "Couldn't read that card — try again." };
  if (!hold || hold.tier !== "lost" || hold.claimedAt || hold.squad.length !== 1) {
    return { ok: false, error: friendlyExpeditionError("no such lost card") };
  }
  const service = createBettingServiceClient();
  const [copy] = await fetchInventoryByIds(service, discordId, hold.squad);
  if (!copy) return { ok: false, error: friendlyExpeditionError("no such lost card") };
  const paid = ransomFor(copy);
  const { data, error: rpcError } = await service.rpc("ransom_lost_card", {
    p_user: discordId,
    p_hold: holdId,
    p_dollars: paid,
  });
  if (rpcError) return { ok: false, error: friendlyExpeditionError(rpcError.message) };
  const row = (Array.isArray(data) ? data[0] : data) as { balance: number } | null;
  return { ok: true, balance: Number(row?.balance ?? 0), paid };
}

/**
 * The sweep, hit by the cron every few minutes: pings every fork that has
 * opened since the last pass, and buries every lost card whose week ran
 * out. Neither needs a client present — silence is already a choice, and
 * the grave is the RPC's — so this is only the part that talks.
 */
export async function sweepExpeditions(now = new Date()): Promise<{ pinged: number; buried: number; storms: number; errors: string[] }> {
  const service = createBettingServiceClient();
  const errors: string[] = [];
  let buried = 0;
  let pinged = 0;
  let storms = 0;

  const { data: buriedCount, error: buryError } = await service.rpc("expire_lost_cards");
  if (buryError) errors.push(`expire: ${buryError.message}`);
  else buried = Number(buriedCount ?? 0);

  const { data, error } = await service
    .from("expedition_runs")
    .select("id, discord_id, tier, squad, forks, choices, started_at, resolves_at, pinged, encounters, rules")
    .is("claimed_at", null)
    .gt("forks", 0)
    .limit(200);
  if (error) {
    errors.push(`forks: ${error.message}`);
    return { pinged, buried, storms, errors };
  }
  const site = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  for (const row of (data as {
    id: number;
    discord_id: string;
    tier: string;
    squad: number[] | null;
    forks: number;
    choices: RecordedChoice[] | null;
    started_at: string;
    resolves_at: string;
    pinged: number;
    encounters: { key: string; leg: number }[] | null;
    rules: number | null;
  }[]) ?? []) {
    const tier = row.tier as ExpeditionTierKey;
    let resolvesAt = row.resolves_at;
    // A storm whose hour has come holds the squad: the run's end moves out
    // (and every fork after it), once per storm.
    const applied = new Set((row.encounters ?? []).filter((entry) => entry.key === "storm").map((entry) => entry.leg));
    for (const storm of encountersFor({ id: row.id, tier, startedAt: row.started_at, resolvesAt, forks: row.forks, rules: Number(row.rules ?? 1) })) {
      if (storm.key !== "storm" || applied.has(storm.leg) || storm.at.getTime() > now.getTime()) continue;
      const { data: delayed, error: delayError } = await service.rpc("delay_expedition", { p_run: row.id, p_leg: storm.leg, p_hours: STORM_HOURS });
      if (delayError) {
        errors.push(`storm ${row.id}: ${delayError.message}`);
        continue;
      }
      const delayedRow = (Array.isArray(delayed) ? delayed[0] : delayed) as { resolves_at: string } | null;
      if (delayedRow?.resolves_at) resolvesAt = delayedRow.resolves_at;
      storms += 1;
    }
    const open = openFork(
      { startedAt: row.started_at, resolvesAt, forks: row.forks, choices: row.choices ?? [] },
      now,
    );
    if (!open || open.index < Number(row.pinged ?? 0)) continue;
    const label = EXPEDITION_TIERS[tier]?.label ?? row.tier;
    const by = open.closesAt.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
    // The ping quotes the trail: the latest journal line, so the fork
    // arrives as the next line of a story rather than a bare deadline.
    const squad = await fetchInventoryByIds(service, row.discord_id, row.squad ?? []);
    const line = latestJournalLine({ id: row.id, tier, startedAt: row.started_at, resolvesAt, forks: row.forks, rules: Number(row.rules ?? 1) }, squad, now);
    try {
      await postCardsWebhook(
        {
          title: `${label} — the squad is at a fork`,
          description: `${line ? `"${line}"\n\n` : ""}Decide by ${by} ET or the squad takes the safe way. ${site ? `${site}/cards/expeditions` : ""}`.trim(),
          color: GOLD,
        },
        `<@${row.discord_id}> your ${label} has reached a fork.`,
      );
      const { error: markError } = await service
        .from("expedition_runs")
        .update({ pinged: open.index + 1 })
        .eq("id", row.id);
      if (markError) errors.push(`ping ${row.id}: ${markError.message}`);
      else pinged += 1;
    } catch (pingError) {
      errors.push(`ping ${row.id}: ${pingError instanceof Error ? pingError.message : String(pingError)}`);
    }
  }
  return { pinged, buried, storms, errors };
}

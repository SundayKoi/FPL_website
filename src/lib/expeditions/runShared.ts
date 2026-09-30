import { randomBytes } from "node:crypto";
import "server-only";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import type { ExpeditionOutcome, ExpeditionTierKey } from "./config";
import { friendlyCampError } from "./camp";
import type { CampaignState } from "./campaigns";
import type { RecordedChoice, RouteResult } from "./routes";
import { RUN_COLUMNS, mapRun, type ExpeditionRun } from "./runRows";

// What the expedition core's halves share (runs.ts is the barrel): the
// result shapes the actions hand back, the error wording, the roll's
// randomness, and the two reads a launch, a fork and a claim all make.
// `server-only` for the same reason as the rest of the core: these take a
// bare Discord id on trust.

export const DAY_MS = 24 * 60 * 60 * 1000;

/** The service-role client every half of the core writes through. */
export type BettingServiceClient = ReturnType<typeof createBettingServiceClient>;

export type LaunchResult =
  | {
      ok: true;
      runId: number;
      resolvesAt: string;
      fee: number;
      freePolicy: boolean;
      convoyCode: string | null;
      /** Set (true) only when a forged policy insured the run. */
      forged?: boolean;
    }
  | { ok: false; error: string };

export interface LaunchOptions {
  /** Buy the policy: lost becomes wounded, dead becomes lost. Once an
   *  Eastern week (twice for a patron, the first free); INSURANCE_FEE. */
  insured?: boolean;
  /** A Rescue's hold id, or an Exorcism's card id. */
  target?: number | null;
  /** "new" opens a convoy and hands back its code; a code joins one. */
  convoy?: "new" | string | null;
  /** The open campaign to walk this run for (campaigns.ts): the tier must
   *  be the campaign's next stage. */
  campaign?: number | null;
  /** Insure the run with a forged policy from the base camp's forge
   *  (camp.ts) instead of buying one: no INSURANCE_FEE, and the weekly
   *  cap never counts it; FORGED_PER_WEEK a week. It IS the run's
   *  insurance, so it takes the place of `insured` — a launch never
   *  spends two policies. Refused on a route that cannot hurt a card. */
  forged?: boolean;
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
      /** The rescue succeeded on the route and found nothing to bring back:
       *  the hold had already closed — buried by the seven-day deadline,
       *  ransomed, or carried home by a stranger. The squad still came
       *  home, so the run resolves; the page must not celebrate a card
       *  that is not on the shelf. */
      rescueMissed: boolean;
      /** The campaign this run walked for, advanced: the stage now done,
       *  whether the campaign finished, and the relic's bearer if one was
       *  printed. Null off a campaign. */
      campaign: { key: CampaignState["key"]; stage: number; finished: boolean; relicName: string | null } | null;
      /** The atlas's news, when there is any: the places this squad was
       *  first to this season (titles), and the road this claim completed.
       *  Absent otherwise, and whenever the atlas is not deployed. */
      atlas?: ClaimAtlas;
    }
  | { ok: false; error: string };

export interface ClaimAtlas {
  firsts: string[];
  road: { tier: ExpeditionTierKey; fragments: number; comp: boolean } | null;
}

export type DecideResult = { ok: true; closesAt: string } | { ok: false; error: string };

export type RansomResult = { ok: true; balance: number; paid: number } | { ok: false; error: string };

/** What an unrecognized exception reads as — and what a launch that
 *  somehow returned no row reads as. */
export const GENERIC_EXPEDITION_ERROR = "Something went wrong with that expedition.";

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
  // The base camp's forged policies (the 14-argument launch_expedition).
  if (/no forged policy/i.test(message)) return "You have no forged policy — build a forge at your base camp and forge one first.";
  if (/forge spent this week/i.test(message)) return "This week's forged launch is used — one a week. The next can go out Monday (Eastern).";
  if (/policy not wanted/i.test(message)) return "A Scouting Run or an Exorcism can't hurt a card, so it takes no policy.";
  if (/forged policy stands alone/i.test(message)) return "A forged policy is this run's insurance on its own — don't buy one on top of it.";
  // The camp's own purchases (upgrade_expedition_camp), for any caller
  // that reaches here with one. The camp actions ask friendlyCampError
  // first, which also words the fragments and the balance as a price.
  if (/bad price|already built|forge not built|forge is full|unknown upgrade/i.test(message)) {
    return friendlyCampError(message) ?? GENERIC_EXPEDITION_ERROR;
  }
  if (/card not owned/i.test(message)) return "Those cards aren't yours.";
  if (/no such convoy/i.test(message)) return "No convoy has that code — check it with whoever gave it to you.";
  if (/convoy is full/i.test(message)) return "That convoy already has its two squads.";
  if (/cannot join your own convoy/i.test(message)) return "That's your own convoy — share the code, don't join it.";
  if (/convoy is another route/i.test(message)) return "That convoy is on a different route — pick the same one to ride along.";
  if (/convoy has moved on/i.test(message)) return "That convoy has reached its first fork — too late to join it.";
  if (/card already deployed|card is on expedition/i.test(message)) {
    return "One of those cards is already out on an expedition.";
  }
  if (/card is wounded/i.test(message)) return "One of those cards is wounded and benched.";
  if (/card is slabbed/i.test(message)) return "One of those cards is sealed in a slab — a slabbed card can't be fielded.";
  if (/card is one of one/i.test(message)) return "A one-of-one or a relic can't go on a route where it could be lost.";
  if (/card is cursed/i.test(message)) return "That card is Cursed — it can't change hands for a week.";
  if (/card is not afflicted/i.test(message)) return "That card has nothing to exorcise.";
  if (/target not in squad|target not wanted|cleansed not the target/i.test(message)) {
    return "The card to cleanse has to be in the squad.";
  }
  if (/no such lost card/i.test(message)) return "That card isn't lost — or it's already home.";
  if (/not enough fragments|fragments not wanted/i.test(message)) return "The Legendary route takes three map fragments.";
  if (/policy already used/i.test(message)) return "This week's free policy is already spent.";
  if (/policy is a patron perk|policy without insurance/i.test(message)) return "The free policy is a patron perk.";
  if (/patron road/i.test(message)) return "The Gilded Road is a patron perk — it opens with the flame.";
  if (/insurance used up/i.test(message)) return "This week's insurance is spent — one policy a week, two for patrons.";
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
export const expeditionRand = () => randomBytes(6).readUIntBE(0, 6) / 2 ** 48;

/** Who is on the other side of a convoy from `discordId`, with their run's
 *  answers so far. Null before anyone joins, or off a convoy. */
export async function convoyPartner(
  service: BettingServiceClient,
  discordId: string,
  convoyId: number,
): Promise<{ discordId: string; username: string; runId: number; choices: RecordedChoice[] } | null> {
  const { data } = await service
    .from("expedition_convoys")
    .select("host_id, host_run, guest_id, guest_run")
    .eq("id", convoyId)
    .maybeSingle();
  const convoy = data as { host_id: string; host_run: number; guest_id: string | null; guest_run: number | null } | null;
  if (!convoy) return null;
  const partnerId = convoy.host_id === discordId ? convoy.guest_id : convoy.host_id;
  const partnerRun = convoy.host_id === discordId ? convoy.guest_run : convoy.host_run;
  if (!partnerId || !partnerRun) return null;
  const [{ data: run }, { data: profile }] = await Promise.all([
    service.from("expedition_runs").select("choices").eq("id", partnerRun).maybeSingle(),
    service.from("betting_profiles").select("username").eq("discord_id", partnerId).maybeSingle(),
  ]);
  return {
    discordId: partnerId,
    username: (profile as { username?: string | null } | null)?.username ?? "Unknown",
    runId: Number(partnerRun),
    choices: Array.isArray((run as { choices?: RecordedChoice[] } | null)?.choices) ? (run as { choices: RecordedChoice[] }).choices : [],
  };
}

export async function readRun(discordId: string, runId: number): Promise<{ run: ExpeditionRun | null; season: string; error: boolean }> {
  const service = createBettingServiceClient();
  const { data, error } = await service
    .from("expedition_runs")
    .select(`${RUN_COLUMNS}, season`)
    .eq("id", runId)
    .eq("discord_id", discordId)
    .maybeSingle();
  if (error) return { run: null, season: "", error: true };
  return { run: data ? mapRun(data as Parameters<typeof mapRun>[0]) : null, season: String((data as { season?: string } | null)?.season ?? ""), error: false };
}

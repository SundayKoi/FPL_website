import "server-only";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchInventoryByIds } from "@/lib/packs/queries";
import { mondayOf } from "@/lib/packs/week";
import { GOLD, postCardsWebhook } from "@/lib/packs/announce";
import { patronActive } from "@/lib/patron/flames";
import {
  EXPEDITION_TIERS,
  INSURANCE_FEE,
  insurancePerWeek,
  SQUAD_SIZE,
  squadMeets,
  squadShine,
  type ExpeditionTierKey,
} from "./config";
import {
  fetchCamp,
  fetchCampaign,
  fetchFixturesSince,
  fetchForgedThisWeek,
  fetchInsuredThisWeek,
  fetchPolicyUsed,
  fetchRulesVersion,
  hasLegendMark,
} from "./queries";
import { roadOf } from "./runRows";
import { FORGED_PER_WEEK } from "./camp";
import { normaliseConvoyCode } from "./convoy";
import { choiceAllowed, choiceSheet, forksFor, forkViews, isCampChoice, openFork, type ForkChoice } from "./routes";
import { ARCHETYPE_RULES, SPEEDRUN_HOURS, SPEEDRUN_MAX_HOURS, traitsOf } from "./archetypes";
import { canBind, type CampaignState } from "./campaigns";
import { watchWeeksOf, weatherOfRun } from "./weather";
import {
  DAY_MS,
  GENERIC_EXPEDITION_ERROR,
  convoyPartner,
  friendlyExpeditionError,
  readRun,
  type BettingServiceClient,
  type DecideResult,
  type LaunchOptions,
  type LaunchResult,
} from "./runShared";

// Sending a squad out, and answering its forks on the way (runs.ts is the
// barrel; the header there says why all of this is `server-only`).

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
  // A forged policy is the run's insurance, not a second one on top: it
  // takes the place of a bought policy below, and a route that cannot hurt
  // a card has nothing for it to cover (the RPC's 'policy not wanted').
  const forged = options.forged === true;
  if (forged && def.risk === "none") return { ok: false, error: friendlyExpeditionError("policy not wanted") };

  const service = createBettingServiceClient();
  // Scoped to this owner inside the query, so a short result is always
  // "you don't own all three" and never "you own two of these".
  const copies = await fetchInventoryByIds(service, discordId, squad);
  if (copies.length !== SQUAD_SIZE) return { ok: false, error: friendlyExpeditionError("card not owned") };

  // Expeditions are league-agnostic — the run is stamped with the season
  // its cards came from rather than with whichever league's page launched
  // it. A squad straddling two of them has no one season to be stamped
  // with, and the run log (fetchRuns) is a per-season read.
  const seasons = new Set(copies.map((copy) => copy.season));
  if (seasons.size !== 1) return { ok: false, error: "Squad cards must come from one league." };
  const season = [...seasons][0];

  const gate = squadMeets(tier, copies, new Date(), tier === "mythic" ? { legendMark: await hasLegendMark(service, discordId) } : undefined);
  // Every reason at once, the way squadMeets reports them: a squad short
  // of two things should hear both rather than being sent back twice.
  if (!gate.ok) return { ok: false, error: gate.reasons.join(" ") };

  // Sealed copies never go out. The table refuses them too (a trigger on
  // expedition_runs); this is the friendly word before the round trip.
  if (copies.some((copy) => copy.card?.slab)) return { ok: false, error: friendlyExpeditionError("card is slabbed") };

  if (def.target === "afflicted") {
    const afflicted = copies.find((copy) => copy.id === target);
    const key = afflicted?.card?.mutation?.key;
    if (key !== "haunted" && key !== "cursed") return { ok: false, error: friendlyExpeditionError("card is not afflicted") };
  }

  // Insurance: a patron's first policy of the Eastern week is free, claimed
  // by the RPC by primary-key insert so two launches can't both be free.
  const insured = !forged && options.insured === true && def.risk !== "none";
  let freePolicy = false;
  let policyWeek: string | null = null;
  // One read of the flame serves both the free policy and the patrons'
  // road. The RPC re-checks the road ('patron road'); this is the friendly
  // word before the round trip, the same as every other gate above.
  let patron = false;
  if (insured || def.patron) {
    const { data: profile } = await service
      .from("betting_profiles")
      .select("patron_until")
      .eq("discord_id", discordId)
      .maybeSingle();
    patron = patronActive((profile as { patron_until?: string | null } | null)?.patron_until);
  }
  if (def.patron && !patron) return { ok: false, error: friendlyExpeditionError("patron road") };
  if (insured) {
    const week = mondayOf(new Date());
    // The weekly cap, read off the runs already insured since Monday. The
    // RPC counts again under the wallet lock ('insurance used up').
    if ((await fetchInsuredThisWeek(service, discordId, week)) >= insurancePerWeek(patron)) {
      return { ok: false, error: friendlyExpeditionError("insurance used up") };
    }
    if (patron) {
      if (!(await fetchPolicyUsed(service, discordId, week))) {
        freePolicy = true;
        policyWeek = week;
      }
    }
  }
  // The forge (camp.ts): a policy held, and this Eastern week's forged
  // launch not yet sent. The friendly word before the round trip; the
  // 14-argument launch_expedition checks both again under the wallet lock
  // and spends the policy there. A camp that cannot be read has no forged
  // policy: the only way to hold one is a camp row, which needs the base
  // camp migration — so an environment without it refuses here and never
  // reaches for a function it does not have. A weekly count that cannot
  // be read is left to the RPC.
  if (forged) {
    const camp = await fetchCamp(service, discordId);
    if (!camp || camp.forgedPolicies < 1) return { ok: false, error: friendlyExpeditionError("no forged policy") };
    const sent = await fetchForgedThisWeek(service, discordId, mondayOf(new Date()));
    if (sent !== null && sent >= FORGED_PER_WEEK) return { ok: false, error: friendlyExpeditionError("forge spent this week") };
  }
  // A forged run pays the tier's fee only: `insured` is false for it, so
  // no INSURANCE_FEE, and no free policy was claimed.
  const fee = def.fee + (insured && !freePolicy ? INSURANCE_FEE : 0);

  // A convoy needs forks to share; a code is tidied the way the box
  // tidies it, so what was read aloud in Discord is what is looked up.
  const convoy = options.convoy === "new" ? "new" : options.convoy ? normaliseConvoyCode(options.convoy) : null;
  if (convoy !== null && def.forks === 0) return { ok: false, error: "A convoy needs a route with forks to share." };
  if (convoy !== null && convoy !== "new" && convoy.length !== 6) return { ok: false, error: "That convoy code isn't right — it's six letters and numbers." };
  // A campaign stage: the campaign must be open, this tier its next
  // stage, and nothing already out for it. Checked here so a refused bind
  // never strands a launched run; the RPC checks it all again under lock.
  let campaign: CampaignState | null = null;
  if (options.campaign) {
    campaign = await fetchCampaign(service, discordId, options.campaign);
    if (!campaign || !canBind(campaign, tier)) return { ok: false, error: "That campaign isn't waiting on this route." };
    if (convoy !== null) return { ok: false, error: "A campaign stage is walked alone — no convoy." };
  }

  // The Speedrunner's clock (archetypes.ts): an hour off a route no longer
  // than SPEEDRUN_MAX_HOURS — the guardrail's line, held by config.test.ts.
  // It is the one edge that acts before the run exists, so the rulebook is
  // asked rather than read off a row: an environment still on the rules
  // before ARCHETYPE_RULES (no expedition_rules_version, read as 1) keeps
  // the full clock. Asked only when a Speedrunner counts on a short route,
  // so every other launch costs no extra round trip. A convoy guest rides
  // the host's clock whatever it asks for.
  let hours = def.durationHours;
  const joining = convoy !== null && convoy !== "new";
  if (!joining && def.durationHours <= SPEEDRUN_MAX_HOURS && traitsOf(copies, ARCHETYPE_RULES).speedrun) {
    if ((await fetchRulesVersion(service)) >= ARCHETYPE_RULES) hours = def.durationHours - SPEEDRUN_HOURS;
  }

  const args = {
    p_user: discordId,
    p_season: season,
    p_tier: tier,
    p_squad: squad,
    p_shine: squadShine(copies),
    p_hours: hours,
    p_forks: def.forks,
    p_insured: insured,
    p_fee: fee,
    p_fragments: def.fragments,
    p_target: target,
    p_policy_week: policyWeek,
    p_convoy: convoy,
  };
  // PostgREST picks the overload by the argument names it is sent, so
  // `p_forged` is sent ONLY on a forged launch: every other launch stays
  // the 13-argument call it always was, and works on a database that has
  // never heard of the camp.
  const { data, error } = await service.rpc("launch_expedition", forged ? { ...args, p_forged: true } : args);
  if (error) return { ok: false, error: friendlyExpeditionError(error.message) };

  const row = (Array.isArray(data) ? data[0] : data) as { run_id: number; resolves_at: string; convoy_code?: string | null } | null;
  if (!row) return { ok: false, error: GENERIC_EXPEDITION_ERROR };
  const code = row.convoy_code ?? null;
  if (convoy !== null && convoy !== "new" && code) await announceConvoyJoin(service, discordId, code, tier);
  if (campaign) {
    const { error: bindError } = await service.rpc("bind_expedition_campaign", { p_user: discordId, p_run: Number(row.run_id), p_campaign: campaign.id });
    // The run is out either way; a bind refused under lock means the
    // stage was taken between the check and the launch, and the run
    // simply walks on its own.
    if (bindError) console.error("expeditions: campaign bind refused", { discordId, runId: row.run_id, message: bindError.message });
  }
  return { ok: true, runId: Number(row.run_id), resolvesAt: row.resolves_at, fee, freePolicy, convoyCode: code, ...(forged ? { forged: true } : {}) };
}

async function announceConvoyJoin(
  service: BettingServiceClient,
  discordId: string,
  code: string,
  tier: ExpeditionTierKey,
): Promise<void> {
  try {
    const { data } = await service.from("expedition_convoys").select("host_id").eq("code", code).maybeSingle();
    const host = (data as { host_id?: string } | null)?.host_id;
    if (!host) return;
    await postCardsWebhook(
      {
        title: "A convoy is rolling",
        description: `<@${discordId}> joined <@${host}>'s convoy on the ${EXPEDITION_TIERS[tier].label}. One clock, one set of forks: a fork pushes only if you both push.`,
        color: GOLD,
      },
      `<@${host}>`,
    );
  } catch (announceError) {
    console.error("expeditions: convoy announcement failed", announceError);
  }
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
  // The weather the run launched under: under Fog every fork is dark, so
  // a foil may light any of them. Read the same way the page read it.
  const weather = weatherOfRun(run, watchWeeksOf(await fetchFixturesSince(service, new Date(Date.parse(run.startedAt) - DAY_MS).toISOString())));
  if (!choiceAllowed(run.tier, index, choice, copies, earlier, roadOf(run), weather?.key ?? null)) {
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
  const closesAt = row?.closes_at ?? open.closesAt.toISOString();

  // In a convoy the answer is news for the other squad: the argument is
  // the game, so it goes to the channel with a real mention. Best effort,
  // after the write.
  if (run.convoy !== null) {
    try {
      const partner = await convoyPartner(service, discordId, run.convoy);
      if (partner) {
        const theirs = partner.choices.find((entry) => entry.index === index)?.choice ?? null;
        // The convoy's road, which both squads walk: seeded by the convoy.
        const story = forksFor(run.tier as ExpeditionTierKey, roadOf(run))[index];
        const by = new Date(closesAt).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
        const verdict =
          theirs === null
            ? `<@${partner.discordId}>, your call — the fork closes ${by} ET, and silence camps.`
            : isCampChoice(theirs) || isCampChoice(choice)
              ? "One of you is camping, so the convoy camps here."
              : "You both pushed — the convoy pushes.";
        await postCardsWebhook(
          {
            title: `Convoy — ${story?.title ?? `fork ${index + 1}`}`,
            description: `<@${discordId}> says ${isCampChoice(choice) ? (choice === "hold" ? "hold" : "camp") : `push (${choice})`} at ${story?.title.toLowerCase() ?? "the fork"} on the ${EXPEDITION_TIERS[run.tier as ExpeditionTierKey].label}. ${verdict}`,
            color: GOLD,
          },
          theirs === null ? `<@${partner.discordId}>` : undefined,
        );
      }
    } catch (announceError) {
      console.error("expeditions: convoy fork announcement failed", announceError);
    }
  }
  return { ok: true, closesAt };
}

"use client";

// The expedition board: what needs you right now, a three-step way to send
// a squad, the squads already out, and everything else in a drawer.
//
//   Right now        — a fork to answer, a squad home, a card lost; or one
//                      line saying nothing needs you and what is next.
//   Send a squad     — 1 pick three cards, 2 pick a run, 3 send them.
//   Your runs        — one card per squad in the field.
//   More             — log, standings, campaigns, camp, league goal,
//                      graveyard, rules.
//
// This component is the state machine and the composition, nothing else:
// the picked squad, the chosen route, the launch options, the errors, the
// ceremony and the transitions between them. Every zone lives in
// ./expeditions/ and reads what it is handed.
//
// One component and one state machine rather than a route per phase. An
// expedition has six states from the player's side (nothing picked, a
// squad assembled, a squad away, a squad waiting at a fork, a squad home,
// a card missing) and every one of them is a view of the same lists —
// your copies, your runs, your holds — so splitting them across routes
// would mean re-fetching the collection to say the same thing six more
// times. The ceremony in particular has to be a state and not a page: what
// a run brought back exists for exactly one render.
//
// Nothing here is authoritative. `squadMeets` disables a launch button,
// `forkOptions` greys a choice, `deployedIds` greys a chip — and the RPCs
// re-check every gate under a row lock, the fork window included. Which is
// why a refused action renders its error inline rather than being
// pre-empted.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtPoints } from "@/lib/betting/format";
import { teamBadgeKey } from "@/lib/cards/build";
import {
  abandonCampaignAction,
  claimExpeditionAction,
  decideForkAction,
  forgePolicyAction,
  launchExpeditionAction,
  ransomLostCardAction,
  startCampaignAction,
  upgradeCampAction,
} from "@/lib/expeditions/actions";
import { forgedPolicyState, tierSlots, wallRelics, type CampState } from "@/lib/expeditions/camp";
import { canBind, type CampaignState } from "@/lib/expeditions/campaigns";
import type { Rivalry } from "@/lib/expeditions/company";
import {
  EXPEDITION_TIERS,
  SQUAD_SIZE,
  TIER_ORDER,
  briefFor,
  insurancePerWeek,
  shineOf,
  type CardCopy,
  type ExpeditionTierKey,
} from "@/lib/expeditions/config";
import { normaliseConvoyCode } from "@/lib/expeditions/convoy";
import type { ConvoyView, ExpeditionRun, Grave, LostHold } from "@/lib/expeditions/queries";
import type { LeagueBoard } from "@/lib/expeditions/league";
import type { ForkChoice } from "@/lib/expeditions/routes";
import type { Accolade, StandingRow } from "@/lib/expeditions/standings";
import { bestRoute, firstOpenRoute, freeCopies, routeGate, suggestSquad, type RouteContext, type RouteGate } from "@/lib/expeditions/suggest";
import type { WeatherKey } from "@/lib/expeditions/weather";
import ClaimCeremony, { type Ceremony } from "./expeditions/ClaimCeremony";
import { easternClock } from "./expeditions/clock";
import FirstRunGuide from "./expeditions/FirstRunGuide";
import MoreDrawer, { openDrawerTab } from "./expeditions/MoreDrawer";
import { PREVIEW_ACTIONS } from "./expeditions/previewActions";
import RightNow from "./expeditions/RightNow";
import RouteStep, { ROUTE_PILL_ORDER } from "./expeditions/RouteStep";
import RunCard from "./expeditions/RunCard";
import SquadStep from "./expeditions/SquadStep";

const LIVE_ACTIONS = {
  launchExpeditionAction,
  decideForkAction,
  claimExpeditionAction,
  ransomLostCardAction,
  startCampaignAction,
  abandonCampaignAction,
  upgradeCampAction,
  forgePolicyAction,
};

/** Scroll a zone into view, where a browser can. */
function reveal(id: string) {
  const target = typeof document === "undefined" ? null : document.getElementById(id);
  if (target && typeof target.scrollIntoView === "function") target.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function ExpeditionBoard({
  copies,
  runs,
  deployedIds,
  today,
  holds = [],
  graves = [],
  fragments = 0,
  patron = false,
  policyUsed = false,
  insuredThisWeek = 0,
  initialPick = null,
  base = "/cards",
  playingToday = [],
  rivals = {},
  convoys = {},
  rivalries = [],
  weather = null,
  standings = [],
  accolades = [],
  viewerId = null,
  campaign = null,
  season = "",
  legendMark = false,
  camp = null,
  forgedThisWeek = null,
  balance = 0,
  league = null,
  preview = false,
}: {
  /** Whether the shelf holds a Legend mark — the Mythic route's gate.
   *  Presentation: the action and launch_expedition check it themselves. */
  legendMark?: boolean;
  /** The viewer's open campaign this season (campaigns.ts), or null. */
  campaign?: CampaignState | null;
  /** The season being browsed, for opening a campaign in it. */
  season?: string;
  /** The season's standings (standings.ts), every collector with a
   *  claimed run; the board ranks and trims them. */
  standings?: StandingRow[];
  /** The season's marks, once it has closed. */
  accolades?: Accolade[];
  /** The viewer, to pick their row out. */
  viewerId?: string | null;
  /** The convoys the runs in the field ride in, by run id. */
  convoys?: Record<number, ConvoyView>;
  /** This week's weather (weather.ts), resolved on the server from the
   *  Eastern Monday and the playoff calendar. Null on a board without one. */
  weather?: WeatherKey | null;
  /** The collectors this squad has raced for a spot this season (company.ts),
   *  newest first, with the score. */
  rivalries?: Rivalry[];
  /** The teams with a fixture today (Eastern), as the schedule spells
   *  them — a squad carrying one of their cards surges. Presentation:
   *  the claim reads the calendar itself. */
  playingToday?: string[];
  /** For each run in the field, the squad's team's next real opponent —
   *  set only on a one-roster squad with a fixture ahead. */
  rivals?: Record<number, string>;
  /** A copy to start the squad with — the shelf's "Send out" action lands
   *  here with ?send=<id>. A hint: ignored unless it is yours and home. */
  initialPick?: number | null;
  /** "/cards" or "/academy/cards", for the empty shelf's pack link and the
   *  ledger. */
  base?: string;
  /** The viewer's shelf for the season being browsed. */
  copies: CardCopy[];
  /** Their runs this season, newest launch first — away, finished, and
   *  the holds on lost cards. */
  runs: ExpeditionRun[];
  /** Every copy of theirs currently away or lost, in ANY season (the lock
   *  is a property of the card). Presentation only; the trigger is the rule. */
  deployedIds: ReadonlySet<number>;
  /** Today's Eastern date, resolved on the server — the same calendar
   *  the claim scores a run's brief against. */
  today: string;
  /** Their lost cards, any season. */
  holds?: LostHold[];
  /** Their dead cards, this season. */
  graves?: Grave[];
  /** Map fragments held. */
  fragments?: number;
  /** Whether the free weekly policy is theirs to spend, and whether it is spent. */
  patron?: boolean;
  policyUsed?: boolean;
  /** Runs insured since Monday, Eastern — against insurancePerWeek(patron). */
  insuredThisWeek?: number;
  /** The base camp (fetchCamp). Null hides the Camp tab and the forged
   *  policy — the camp could not be read, or is not here yet. */
  camp?: CampState | null;
  /** Forged launches since Monday, Eastern (fetchForgedThisWeek); null
   *  when unread — the option stays offered and the RPC decides. */
  forgedThisWeek?: number | null;
  /** The wallet, in dollars — what the camp's prices are set against. */
  balance?: number;
  /** The league goal this week and last (fetchLeagueBoard); null hides
   *  the League tab and the This-week line's progress. */
  league?: LeagueBoard | null;
  /** The staff preview: every action is a stub that sends nothing. */
  preview?: boolean;
}) {
  const router = useRouter();
  const actions: typeof LIVE_ACTIONS = preview ? PREVIEW_ACTIONS : LIVE_ACTIONS;
  const [picked, setPicked] = useState<ReadonlySet<number>>(
    () =>
      new Set(
        initialPick !== null && copies.some((copy) => copy.id === initialPick) && !deployedIds.has(initialPick)
          ? [initialPick]
          : [],
      ),
  );
  /** The route the collector chose; null follows the squad (the best
   *  route it can run is preselected until a pill is tapped). */
  const [chosenRoute, setChosenRoute] = useState<ExpeditionTierKey | null>(null);
  /** Three picked folds step 1 away; "Change" opens it again. */
  const [squadOpen, setSquadOpen] = useState(false);
  const [suggestPress, setSuggestPress] = useState(0);
  const [insured, setInsured] = useState(false);
  /** "Use a forged policy": stands in for the week's insurance, so the
   *  two are never ticked together. */
  const [forged, setForged] = useState(false);
  const [convoyMode, setConvoyMode] = useState<"solo" | "new" | "join">("solo");
  const [joinCode, setJoinCode] = useState("");
  const [rescueTarget, setRescueTarget] = useState<number | null>(holds[0]?.holdId ?? null);
  const [cleanseTarget, setCleanseTarget] = useState<number | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [forkError, setForkError] = useState<{ runId: number; error: string } | null>(null);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ceremony, setCeremony] = useState<Ceremony | null>(null);
  const [claimed, setClaimed] = useState<ReadonlySet<number>>(new Set());
  const [busyTier, setBusyTier] = useState<ExpeditionTierKey | null>(null);
  const [busyRun, setBusyRun] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const brief = briefFor(today);
  const playingKeys = useMemo(() => new Set(playingToday.map(teamBadgeKey)), [playingToday]);
  const byId = useMemo(() => new Map(copies.map((copy) => [copy.id, copy])), [copies]);
  const sorted = useMemo(
    () => [...copies].sort((a, b) => shineOf(b) - shineOf(a) || a.playerName.localeCompare(b.playerName)),
    [copies],
  );
  const squad = useMemo(() => copies.filter((copy) => picked.has(copy.id)), [copies, picked]);
  const full = picked.size >= SQUAD_SIZE;
  // Not a ticking clock: the picker and the gates only need "now" to the
  // render, and a clock here would repaint every chip once a second.
  const now = new Date();

  const active = runs.filter((run) => run.tier !== "lost" && run.claimedAt === null && !claimed.has(run.id));
  const finished = runs.filter((run) => run.tier !== "lost" && (run.claimedAt !== null || claimed.has(run.id)));
  const lostIds = new Set(holds.map((hold) => hold.cardId));
  const free = freeCopies(copies, { deployedIds, lostIds, now });
  // A route is "out" when every slot it has is in the field: one run per
  // route, two Scouting Runs with the camp's squad slot.
  const runsOut = new Map<string, number>();
  for (const run of active) runsOut.set(run.tier, (runsOut.get(run.tier) ?? 0) + 1);
  const context: RouteContext = {
    now,
    fragments,
    patron,
    legendMark,
    tiersOut: new Set(TIER_ORDER.filter((tier) => (runsOut.get(tier) ?? 0) >= tierSlots(camp, tier))),
    lostCards: holds.length,
  };
  const suggestion = suggestSquad(free, context);
  const gates = Object.fromEntries(TIER_ORDER.map((tier) => [tier, routeGate(tier, squad, context)])) as Record<ExpeditionTierKey, RouteGate>;
  const route: ExpeditionTierKey =
    chosenRoute ?? (full ? bestRoute(squad, context) : null) ?? suggestion?.route ?? firstOpenRoute(gates, ROUTE_PILL_ORDER);
  const afflictedInSquad = squad.filter((copy) => copy.card?.mutation?.key === "haunted" || copy.card?.mutation?.key === "cursed");
  const freePolicy = patron && !policyUsed;
  const insuranceLeft = Math.max(0, insurancePerWeek(patron) - insuredThisWeek);
  const awayUntil = new Map(active.flatMap((run) => run.squad.map((id) => [id, run.resolvesAt] as const)));
  const nextBack = active.reduce<Date | null>((soonest, run) => {
    const at = new Date(run.resolvesAt);
    return !soonest || at < soonest ? at : soonest;
  }, null);
  const showGuide = runs.length === 0 && holds.length === 0 && copies.length > 0;

  function toggle(id: number) {
    setLaunchError(null);
    const next = new Set(picked);
    if (!next.delete(id) && next.size < SQUAD_SIZE) next.add(id);
    // The third pick folds the grid away: the next step is right below.
    if (next.size === SQUAD_SIZE && !picked.has(id)) setSquadOpen(false);
    setPicked(next);
  }

  function suggest() {
    const found = suggestSquad(free, context, suggestPress);
    if (!found) return;
    setLaunchError(null);
    setPicked(new Set(found.squad.map((copy) => copy.id)));
    if (found.route) setChosenRoute(found.route);
    setSquadOpen(false);
    setSuggestPress((press) => press + 1);
  }

  function launch(tier: ExpeditionTierKey) {
    setLaunchError(null);
    setNotice(null);
    setBusyTier(tier);
    const def = EXPEDITION_TIERS[tier];
    const squadIds = squad.map((copy) => copy.id);
    const target = def.target === "lost" ? rescueTarget : def.target === "afflicted" ? (cleanseTarget ?? afflictedInSquad[0]?.id ?? null) : null;
    // A forged policy only where the route card offers one it can use.
    const forgedHere = forged && forgedPolicyState(camp, forgedThisWeek, tier)?.reason === null;
    // Another of this route can follow while a slot is free (the camp's
    // second Scouting Run).
    const slotLeft = (runsOut.get(tier) ?? 0) + 1 < tierSlots(camp, tier);
    startTransition(async () => {
      const convoy = convoyMode === "new" ? "new" : convoyMode === "join" ? normaliseConvoyCode(joinCode) : null;
      // A campaign stage: bound automatically when this route is the open
      // campaign's next stage and nothing is out for it.
      const forCampaign = campaign && canBind(campaign, tier) && convoy === null ? campaign.id : null;
      const result = await actions.launchExpeditionAction(tier, squadIds, {
        insured: insured && insuranceLeft > 0 && def.risk !== "none" && !forgedHere,
        target,
        convoy,
        ...(forCampaign !== null ? { campaign: forCampaign } : {}),
        ...(forgedHere ? { forged: true } : {}),
      });
      setBusyTier(null);
      if (!result.ok) {
        setLaunchError(result.error);
        return;
      }
      setPicked(new Set());
      setChosenRoute(null);
      setSquadOpen(false);
      setInsured(false);
      setForged(false);
      setConvoyMode("solo");
      setJoinCode("");
      setNotice(
        `${def.label} is out. Back ${easternClock(result.resolvesAt)} ET${def.forks > 0 ? `, with ${def.forks} fork${def.forks === 1 ? "" : "s"} to answer on the way` : ""}.${result.fee > 0 ? ` ${fmtPoints(result.fee)} paid.` : ""}${result.freePolicy ? " This week's free policy covers it." : ""}${result.forged ? " A forged policy covers it." : ""}${
          convoy === "new" && result.convoyCode
            ? ` Convoy code ${result.convoyCode} — share it; a partner can join until the first fork opens.`
            : convoy
              ? " You're in the convoy: one clock, one set of forks."
              : ""
        }${
          slotLeft
            ? ` Your camp's second slot is free — pick three more to send another ${def.label}.`
            : " One run per route at a time — pick three more to send another route."
        }`,
      );
      reveal("send-a-squad");
      router.refresh();
    });
  }

  function decide(run: ExpeditionRun, index: number, choice: ForkChoice) {
    setForkError(null);
    setBusyRun(run.id);
    startTransition(async () => {
      const result = await actions.decideForkAction(run.id, index, choice);
      setBusyRun(null);
      if (!result.ok) {
        setForkError({ runId: run.id, error: result.error });
        router.refresh();
        return;
      }
      router.refresh();
    });
  }

  function claim(run: ExpeditionRun) {
    setClaimError(null);
    setBusyRun(run.id);
    startTransition(async () => {
      const result = await actions.claimExpeditionAction(run.id);
      setBusyRun(null);
      if (!result.ok) {
        setClaimError(result.error);
        // The common refusal is 'already claimed' — the claim went through
        // and the response was dropped. Re-reading moves it into the log.
        router.refresh();
        return;
      }
      setCeremony({
        run,
        outcome: result.outcome,
        route: result.route,
        baseDollars: result.baseDollars,
        merchant: result.merchant,
        stranded: result.stranded,
        surge: result.surge,
        echo: result.echo,
        bearerId: result.bearerId,
        balance: result.balance,
        fragments: result.fragments,
        rescueMissed: result.rescueMissed,
        campaign: result.campaign,
      });
      setClaimed((current) => new Set(current).add(run.id));
      router.refresh();
    });
  }

  function ransom(hold: LostHold) {
    setHoldError(null);
    setBusyRun(hold.holdId);
    startTransition(async () => {
      const result = await actions.ransomLostCardAction(hold.holdId);
      setBusyRun(null);
      if (!result.ok) {
        setHoldError(result.error);
        router.refresh();
        return;
      }
      setNotice(`${byId.get(hold.cardId)?.playerName ?? "The card"} is home, wounded, for ${fmtPoints(result.paid)}. Balance ${fmtPoints(result.balance)}.`);
      router.refresh();
    });
  }

  function rescue(hold: LostHold) {
    setRescueTarget(hold.holdId);
    setChosenRoute("rescue");
    setNotice(`Pick three cards and send a Rescue after ${byId.get(hold.cardId)?.playerName ?? "the card"}.`);
    reveal("send-a-squad");
  }

  return (
    <div className="flex flex-col gap-8" data-testid="expedition-board">
      {showGuide ? (
        <FirstRunGuide
          canSuggest={suggestion !== null}
          onSuggest={() => {
            suggest();
            reveal("step-route");
          }}
        />
      ) : (
        <RightNow
          active={active}
          holds={holds}
          byId={byId}
          busy={pending}
          busyRun={busyRun}
          rivals={rivals}
          convoys={convoys}
          forkError={forkError}
          claimError={claimError}
          holdError={holdError}
          onDecide={decide}
          onClaim={claim}
          onRescue={rescue}
          onRansom={ransom}
        />
      )}

      <div id="send-a-squad" data-testid="stepper" className="flex scroll-mt-20 flex-col gap-4">
        <p className="label-dash">Send a squad</p>
        {notice ? (
          <p role="status" data-testid="expedition-notice" className="rounded-md border border-mint/40 bg-mint/10 px-3 py-2 text-sm text-mint">
            {notice}
          </p>
        ) : null}
        <SquadStep
          copies={sorted}
          picked={picked}
          holds={holds}
          deployedIds={deployedIds}
          awayUntil={awayUntil}
          now={now}
          playingKeys={playingKeys}
          base={base}
          collapsed={full && !squadOpen}
          canSuggest={suggestion !== null}
          nextBack={nextBack}
          onToggle={toggle}
          onClear={() => setPicked(new Set())}
          onSuggest={suggest}
          onChange={() => setSquadOpen(true)}
        />
        <RouteStep
          route={route}
          gates={gates}
          squad={squad}
          onRoute={(tier) => {
            setLaunchError(null);
            setChosenRoute(tier);
          }}
          brief={brief}
          weather={weather}
          playingToday={playingToday}
          fragments={fragments}
          patron={patron}
          freePolicy={freePolicy}
          insuranceLeft={insuranceLeft}
          insured={insured}
          onInsured={(value) => {
            setInsured(value);
            if (value) setForged(false);
          }}
          camp={camp}
          forgedThisWeek={forgedThisWeek}
          forged={forged}
          onForged={(value) => {
            setForged(value);
            if (value) setInsured(false);
          }}
          runsOut={runsOut.get(route) ?? 0}
          league={league}
          onOpenLeague={() => openDrawerTab("league")}
          convoyMode={convoyMode}
          onConvoyMode={setConvoyMode}
          joinCode={joinCode}
          onJoinCode={setJoinCode}
          holds={holds}
          byId={byId}
          rescueTarget={rescueTarget}
          onRescueTarget={setRescueTarget}
          afflicted={afflictedInSquad}
          cleanseTarget={cleanseTarget}
          onCleanseTarget={setCleanseTarget}
          campaign={campaign}
          busy={pending}
          sending={busyTier}
          launchError={launchError}
          onLaunch={launch}
        />
      </div>

      {active.length > 0 ? (
        <section aria-label="Expeditions in the field" data-testid="your-runs" className="flex flex-col gap-3">
          <h2 className="label-dash">Your runs</h2>
          <ul className="flex flex-col gap-3">
            {active.map((run) => (
              <RunCard key={run.id} run={run} byId={byId} convoy={convoys[run.id] ?? null} />
            ))}
          </ul>
        </section>
      ) : null}

      <MoreDrawer
        finished={finished}
        byId={byId}
        standings={standings}
        accolades={accolades}
        viewerId={viewerId}
        rivalries={rivalries}
        graves={graves}
        campaign={campaign}
        camp={
          camp
            ? {
                camp,
                fragments,
                balance,
                relics: wallRelics(copies),
                // The wall hangs the viewer's own marks, not the season's.
                accolades: viewerId ? accolades.filter((accolade) => accolade.discordId === viewerId) : [],
                forgedThisWeek,
                // Landmarks and roads come with the atlas (Phase 6); until
                // then the wall leaves those rows out.
                landmarks: undefined,
                roads: undefined,
                onUpgrade: async (upgrade, level) => {
                  const result = await actions.upgradeCampAction(upgrade, level);
                  if (result.ok) router.refresh();
                  return result.ok ? null : result.error;
                },
                onForge: async (held) => {
                  const result = await actions.forgePolicyAction(held);
                  if (result.ok) router.refresh();
                  return result.ok ? null : result.error;
                },
              }
            : null
        }
        league={league}
        ledgerHref={`${base}/expeditions/ledger`}
        onStartCampaign={async (key) => {
          const result = await actions.startCampaignAction(key, season);
          if (result.ok) router.refresh();
          return result.ok ? null : result.error;
        }}
        onAbandonCampaign={async (id) => {
          const result = await actions.abandonCampaignAction(id);
          if (result.ok) router.refresh();
          return result.ok ? null : result.error;
        }}
      />

      {ceremony ? <ClaimCeremony ceremony={ceremony} copies={byId} onClose={() => setCeremony(null)} /> : null}
    </div>
  );
}

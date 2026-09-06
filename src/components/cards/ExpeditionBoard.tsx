"use client";

// The expedition board: read the rules, pick three cards, choose a route,
// answer the forks as the squad reaches them, and — hours later — find out
// who came back and what they came back as.
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

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { gradeOf, wearOf } from "@/lib/cards/wear";
import EmptyShelf from "./EmptyShelf";
import { useRouter } from "next/navigation";
import CountUp from "@/components/home/CountUp";
import { fmtPoints } from "@/lib/betting/format";
import { mutationByKey } from "@/lib/cards/mutations";
import { championCenteredUrl } from "@/lib/match-draft/champions";
import { easternDateOf } from "@/lib/packs/week";
import {
  SURGE_BONUS,
  BRIEF_BONUS,
  EXPEDITION_TIERS,
  INSURANCE_FEE,
  MARK_RANK,
  SHINE_BONUS_CAP,
  SQUAD_SIZE,
  TIER_ORDER,
  briefFor,
  isProtected,
  payoutRange,
  ransomFor,
  shineOf,
  squadMeets,
  squadShine,
  woundedUntil,
  type CardCopy,
  type ExpeditionMark as ExpeditionMarkKind,
  type ExpeditionOutcome,
  type ExpeditionTierKey,
  type OutcomeGrade,
} from "@/lib/expeditions/config";
import {
  FORKS,
  FRAGMENT_CHANCE,
  choiceSheet,
  consentLine,
  forkOptions,
  forkViews,
  type CardFate,
  type ForkChoice,
  type ForkView,
  type RouteResult,
} from "@/lib/expeditions/routes";
import {
  claimExpeditionAction,
  decideForkAction,
  launchExpeditionAction,
  ransomLostCardAction,
} from "@/lib/expeditions/actions";
import { hasTrail, type ConvoyView, type ExpeditionRun, type Grave, type LostHold } from "@/lib/expeditions/queries";
import { convoyVerdict, normaliseConvoyCode } from "@/lib/expeditions/convoy";
import { banterFor, journalFor } from "@/lib/expeditions/journal";
import { cardTeamKey } from "@/lib/expeditions/matchday";
import { teamBadgeKey } from "@/lib/cards/build";
import ExpeditionRules, { RISK_CLASS, RISK_LABEL, requirementLine } from "./ExpeditionRules";
import PlayerCard3D from "./PlayerCard3D";
import RouteMap from "./RouteMap";
import { tierLabel } from "./CardCopyPreview";

/** How a claim reads before you get to the numbers. */
const GRADE_HEADLINE: Record<OutcomeGrade, string> = {
  poor: "They made it back",
  solid: "A good run",
  jackpot: "They struck gold",
};

const FATE_LABEL: Record<CardFate["fate"], string> = {
  home: "Home",
  wounded: "Wounded",
  lost: "Lost",
  dead: "Dead",
};

const FATE_CLASS: Record<CardFate["fate"], string> = {
  home: "text-mint",
  wounded: "text-gold",
  lost: "text-coral",
  dead: "text-red-300",
};

/**
 * "1h 29m" / "4m 12s" / "" once it is due.
 *
 * Minute granularity above the hour on purpose: a seconds counter on a
 * 48-hour run is a spinning odometer nobody reads, and it would repaint the
 * whole board once a second for two days.
 */
function untilLabel(msLeft: number): string {
  if (msLeft <= 0) return "";
  const seconds = Math.floor(msLeft / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours >= 48) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return "seconds";
}

function easternClock(iso: string | Date): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

/**
 * The wall clock, as an external store rather than a `setInterval` writing
 * `useState`.
 *
 * It is genuinely EXTERNAL state and `useSyncExternalStore` is the hook for
 * that; and it is the only clock that hydrates safely: `getServerSnapshot`
 * hands the server render a 0, so the HTML says "back at 4:15 PM ET" — a
 * fact needing no clock — and only the hydrated browser swaps in a live
 * countdown. `readClock` caches to the second because getSnapshot MUST
 * return a stable value between reads or React re-renders forever.
 */
const CLOCK_TICK_MS = 1000;
let clockCache = 0;

function subscribeClock(onChange: () => void): () => void {
  const timer = setInterval(() => {
    clockCache = Date.now();
    onChange();
  }, CLOCK_TICK_MS);
  return () => clearInterval(timer);
}

function readClock(): number {
  const now = Date.now();
  if (now - clockCache >= CLOCK_TICK_MS) clockCache = now;
  return clockCache;
}

/** No clock on the server — 0 reads as "not mounted yet". */
function readServerClock(): number {
  return 0;
}

/**
 * Where one run is up to: a live countdown, or the button that ends it.
 * Its own component because it is the only thing on the board that repaints
 * every second, and a clock in the parent would repaint the whole squad
 * picker with it — several hundred chips on a real collection.
 */
function RunStatus({
  run,
  label,
  busy,
  claiming,
  onClaim,
}: {
  run: ExpeditionRun;
  label: string;
  busy: boolean;
  claiming: boolean;
  onClaim: () => void;
}) {
  const now = useSyncExternalStore(subscribeClock, readClock, readServerClock);
  const due = new Date(run.resolvesAt).getTime();

  if (now === 0) {
    return <span className="text-sm text-steel">Back at {easternClock(run.resolvesAt)} ET</span>;
  }
  if (due <= now) {
    return (
      <button
        type="button"
        onClick={onClaim}
        disabled={busy}
        aria-label={`Claim the ${label}`}
        className="btn-coral px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
      >
        {claiming ? "Bringing them home…" : "Bring them home"}
      </button>
    );
  }
  return <span className="text-sm font-semibold text-white">Back in {untilLabel(due - now)}</span>;
}

/** The route under a run: the map with the squad on it, and the trail
 *  journal so far. Both read the clock, so they live in one component that
 *  repaints on its own rather than in the row. */
function RunTrail({ run, copies }: { run: ExpeditionRun; copies: CardCopy[] }) {
  const now = useSyncExternalStore(subscribeClock, readClock, readServerClock);
  const [showAll, setShowAll] = useState(false);
  const clock = new Date(now === 0 ? Date.parse(run.startedAt) : now);
  const views = forkViews(run, clock);
  const start = Date.parse(run.startedAt);
  const end = Date.parse(run.resolvesAt);
  const progress = now === 0 ? null : Math.max(0, Math.min(1, (now - start) / Math.max(1, end - start)));
  const tier = run.tier as ExpeditionTierKey;
  const journal = journalFor({ id: run.id, tier, startedAt: run.startedAt, resolvesAt: run.resolvesAt, forks: run.forks, claimedAt: run.claimedAt, rules: run.rules }, copies, clock);
  const shown = showAll ? journal : journal.slice(-3);
  return (
    <div className="flex w-full flex-col gap-2">
      <RouteMap
        tier={tier}
        progress={progress}
        forks={views.map((fork) => ({ status: fork.status, pushed: fork.choice !== null && fork.choice !== "camp" }))}
      />
      {journal.length > 0 ? (
        <div data-testid={`journal-${run.id}`} className="flex flex-col gap-1">
          <ol className="flex flex-col gap-0.5">
            {shown.map((entry, index) => (
              <li
                key={`${entry.at.getTime()}-${index}`}
                className={`text-xs ${entry.kind === "encounter" ? "text-gold" : entry.kind === "arrive" || entry.kind === "home" ? "text-white" : "text-steel"}`}
              >
                <span className="mr-1.5 font-mono text-[10px] text-steel/70">{easternClock(entry.at)}</span>
                {entry.text}
              </li>
            ))}
          </ol>
          {journal.length > 3 ? (
            <button type="button" onClick={() => setShowAll((value) => !value)} className="self-start text-[10px] uppercase tracking-wide text-steel underline-offset-4 hover:text-coral hover:underline">
              {showAll ? "Latest only" : `Whole journal (${journal.length})`}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-steel">The squad has just set out. The first word comes back in a few hours.</p>
      )}
    </div>
  );
}

/** The art this copy printed in. Three kinds of copy can march, and only
 *  ONE of them carries a `signature`: a player card names its champion
 *  there, a champions relic on champWin, a moment on moment. */
function copyArtUrl(copy: CardCopy): string | null {
  const champion =
    copy.card?.signature?.champion ?? copy.card?.champWin?.champion ?? copy.card?.moment?.champion ?? null;
  return champion ? championCenteredUrl(champion, copy.card?.artSkin ?? 0) : null;
}

/** One card in a run's squad strip — small, because the decision has
 *  already been made and this is a reminder of who is away. */
function SquadThumb({ copy, id }: { copy: CardCopy | undefined; id: number }) {
  const art = copy ? copyArtUrl(copy) : null;
  return (
    <span className="flex w-14 shrink-0 flex-col items-center gap-1">
      {art ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={art}
          alt=""
          aria-hidden
          loading="lazy"
          className="h-9 w-14 rounded-sm border border-line object-cover object-[center_20%]"
        />
      ) : (
        <span aria-hidden className="grid h-9 w-14 place-content-center rounded-sm border border-line bg-navy/60 text-[10px] text-steel">
          ?
        </span>
      )}
      <span className="w-full truncate text-center text-[10px] text-steel" title={copy?.playerName}>
        {copy?.playerName ?? `#${id}`}
      </span>
    </span>
  );
}

/**
 * A fork the squad is standing at. The story, the options with their odds,
 * and how long until the squad decides for you.
 */
/** The Legendary route's second fork, when a one-roster squad's real next
 *  opponent is known: what is singing under the floor has a name. */
export const RIVAL_FORK: { tier: ExpeditionTierKey; index: number } = { tier: "legendary", index: 1 };

export function rivalStory(rival: string): string {
  return `Something is singing under the floor and the squad knows the song — it is ${rival}'s, and they are playing them next. There is light ahead, and the singing gets louder toward it.`;
}

function ForkPrompt({
  run,
  fork,
  copies,
  busy,
  rival = null,
  convoy = null,
  onDecide,
}: {
  run: ExpeditionRun;
  fork: ForkView;
  copies: CardCopy[];
  busy: boolean;
  /** The squad's team's next real opponent, when the squad is one roster. */
  rival?: string | null;
  /** The convoy this run rides in, with the partner's answer so far. */
  convoy?: ConvoyView | null;
  onDecide: (choice: ForkChoice) => void;
}) {
  const now = useSyncExternalStore(subscribeClock, readClock, readServerClock);
  const def = EXPEDITION_TIERS[run.tier as ExpeditionTierKey];
  const story = FORKS[run.tier as ExpeditionTierKey]?.[fork.index];
  if (!def || !story) return null;
  const options = forkOptions(run.tier as ExpeditionTierKey, fork.index, copies, choiceSheet(run.forks, run.choices));
  const banter = banterFor(run.tier as ExpeditionTierKey, fork.index, copies, run.id);
  const left = fork.closesAt.getTime() - now;
  return (
    <li data-testid={`fork-${run.id}-${fork.index}`} className="card-brand flex flex-col gap-3 border-gold/60 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="label-dash text-gold">
            {def.label} · fork {fork.index + 1} of {run.forks}
          </span>
          <h3 className="type-display mt-0.5 text-xl">{story.title}</h3>
        </div>
        <span className="text-xs text-steel">
          {now === 0 ? `Decide by ${easternClock(fork.closesAt)} ET` : left > 0 ? `${untilLabel(left)} to decide` : "Deciding…"} — silence camps
        </span>
      </div>
      <p className="max-w-3xl text-sm text-white">
        {rival && hasTrail(run) && run.tier === RIVAL_FORK.tier && fork.index === RIVAL_FORK.index ? (
          <span data-testid="rival-story">{rivalStory(rival)}</span>
        ) : (
          story.story
        )}
        {banter ? <span data-testid="banter" className="text-steel"> {banter}</span> : null}
      </p>
      {convoy ? (
        <p data-testid="convoy-fork" className="rounded-md border border-gold/40 bg-gold/5 px-3 py-1.5 text-xs text-white">
          <span className="font-bold uppercase tracking-[0.14em] text-gold">Convoy</span>{" "}
          {convoy.partner
            ? (() => {
                const theirs = convoy.partner.choices.find((entry) => entry.index === fork.index)?.choice ?? null;
                const verdict = convoyVerdict(null, theirs);
                return `${convoy.partner.username} ${theirs === null ? "hasn't answered yet" : theirs === "camp" ? "says camp" : `says push (${theirs})`}. ${
                  verdict === "camping" ? "The convoy camps here whatever you say." : "It pushes only if you both push — a camp on either side camps it."
                }`;
              })()
            : `Nobody joined with code ${convoy.code} before the first fork — the squad walks alone.`}
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((option) => (
          <button
            key={option.choice}
            type="button"
            disabled={busy || option.locked !== null}
            onClick={() => onDecide(option.choice)}
            aria-label={`${option.label} — ${option.choice}`}
            title={option.locked ?? undefined}
            className={`flex flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left transition disabled:cursor-not-allowed ${
              option.locked
                ? "border-line/60 opacity-40"
                : option.choice === "camp"
                  ? "border-mint/50 hover:bg-mint/10"
                  : "border-coral/60 hover:bg-coral/10"
            }`}
          >
            <span className="text-sm font-semibold text-white">{option.label}</span>
            <span className="text-xs text-steel">{option.locked ?? option.tease}</span>
          </button>
        ))}
      </div>
    </li>
  );
}

/** A lost card and the two ways home. */
function MissingRow({
  hold,
  copy,
  busy,
  onRescue,
  onRansom,
}: {
  hold: LostHold;
  copy: CardCopy | undefined;
  busy: boolean;
  onRescue: () => void;
  onRansom: () => void;
}) {
  const now = useSyncExternalStore(subscribeClock, readClock, readServerClock);
  const [armed, setArmed] = useState(false);
  const left = new Date(hold.expiresAt).getTime() - now;
  const price = copy ? ransomFor(copy) : null;
  return (
    <li data-testid={`hold-${hold.holdId}`} className="card-brand flex flex-wrap items-center gap-x-5 gap-y-3 border-coral/50 px-4 py-3">
      <div className="min-w-[9rem]">
        <span className="label-dash text-coral">Missing</span>
        <p className="type-display mt-0.5 text-lg">{copy?.playerName ?? `#${hold.cardId}`}</p>
        <p className="text-xs text-steel">
          {now === 0 ? `Gone for good at ${easternClock(hold.expiresAt)} ET` : left > 0 ? `${untilLabel(left)} until it is gone for good` : "Being buried…"}
        </p>
      </div>
      <SquadThumb copy={copy} id={hold.cardId} />
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button type="button" onClick={onRescue} disabled={busy} className="btn-pill px-4 py-2 text-sm disabled:opacity-50">
          Mount a rescue
        </button>
        <button
          type="button"
          onClick={() => {
            if (!armed) {
              setArmed(true);
              return;
            }
            setArmed(false);
            onRansom();
          }}
          onBlur={() => setArmed(false)}
          disabled={busy || price === null}
          aria-label={armed ? `Confirm — pay ${price ?? 0} to ransom ${copy?.playerName ?? "the card"}` : `Ransom for ${price ?? 0}`}
          className="btn-coral px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {armed ? `Confirm — pay ${fmtPoints(price ?? 0)}` : `Ransom for ${fmtPoints(price ?? 0)}`}
        </button>
      </div>
    </li>
  );
}

interface Ceremony {
  /** The run that just came home — the ceremony needs its LAUNCH day to
   *  name the brief the payout was scored against. */
  run: ExpeditionRun;
  outcome: ExpeditionOutcome;
  route: RouteResult;
  baseDollars: number;
  merchant: number;
  stranded: { holdId: number; bounty: number } | null;
  surge: string[];
  echo: { inventoryId: number; slug: string; playerName: string; moment: number } | null;
  bearerId: number | null;
  balance: number;
  fragments: number;
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
  initialPick = null,
  base = "/cards",
  playingToday = [],
  rivals = {},
  convoys = {},
}: {
  /** The convoys the runs in the field ride in, by run id. */
  convoys?: Record<number, ConvoyView>;
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
  /** "/cards" or "/academy/cards", for the empty shelf's pack link. */
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
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<ReadonlySet<number>>(
    () =>
      new Set(
        initialPick !== null && copies.some((copy) => copy.id === initialPick) && !deployedIds.has(initialPick)
          ? [initialPick]
          : [],
      ),
  );
  const [insured, setInsured] = useState(false);
  const [convoyMode, setConvoyMode] = useState<"solo" | "new" | "join">("solo");
  const [joinCode, setJoinCode] = useState("");
  const [rescueTarget, setRescueTarget] = useState<number | null>(holds[0]?.holdId ?? null);
  const [cleanseTarget, setCleanseTarget] = useState<number | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [forkError, setForkError] = useState<string | null>(null);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ceremony, setCeremony] = useState<Ceremony | null>(null);
  const [claimed, setClaimed] = useState<ReadonlySet<number>>(new Set());
  const [busyTier, setBusyTier] = useState<ExpeditionTierKey | null>(null);
  const [busyRun, setBusyRun] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const launchRef = useRef<HTMLElement | null>(null);

  const brief = briefFor(today);
  const playingKeys = useMemo(() => new Set(playingToday.map(teamBadgeKey)), [playingToday]);
  const byId = useMemo(() => new Map(copies.map((copy) => [copy.id, copy])), [copies]);
  const sorted = useMemo(
    () => [...copies].sort((a, b) => shineOf(b) - shineOf(a) || a.playerName.localeCompare(b.playerName)),
    [copies],
  );
  const squad = useMemo(() => copies.filter((copy) => picked.has(copy.id)), [copies, picked]);
  const shine = squadShine(squad);
  const full = picked.size >= SQUAD_SIZE;
  const now = new Date();

  const active = runs.filter((run) => run.tier !== "lost" && run.claimedAt === null && !claimed.has(run.id));
  const tiersOut = new Set(active.map((run) => run.tier));
  const finished = runs.filter((run) => run.tier !== "lost" && (run.claimedAt !== null || claimed.has(run.id)));
  const openForks = active
    .flatMap((run) => forkViews(run, now).filter((fork) => fork.status === "open").map((fork) => ({ run, fork })));
  const afflictedInSquad = squad.filter((copy) => copy.card?.mutation?.key === "haunted" || copy.card?.mutation?.key === "cursed");
  const freePolicy = patron && !policyUsed;

  function toggle(id: number) {
    setLaunchError(null);
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(id) && next.size < SQUAD_SIZE) next.add(id);
      return next;
    });
  }

  function launch(tier: ExpeditionTierKey) {
    setLaunchError(null);
    setNotice(null);
    setBusyTier(tier);
    const def = EXPEDITION_TIERS[tier];
    const squadIds = squad.map((copy) => copy.id);
    const target = def.target === "lost" ? rescueTarget : def.target === "afflicted" ? (cleanseTarget ?? afflictedInSquad[0]?.id ?? null) : null;
    startTransition(async () => {
      const convoy = convoyMode === "new" ? "new" : convoyMode === "join" ? normaliseConvoyCode(joinCode) : null;
      const result = await launchExpeditionAction(tier, squadIds, { insured: insured && def.risk !== "none", target, convoy });
      setBusyTier(null);
      if (!result.ok) {
        setLaunchError(result.error);
        return;
      }
      setPicked(new Set());
      setInsured(false);
      setConvoyMode("solo");
      setJoinCode("");
      setNotice(
        `${def.label} is out. Back ${easternClock(result.resolvesAt)} ET${def.forks > 0 ? `, with ${def.forks} fork${def.forks === 1 ? "" : "s"} to answer on the way` : ""}.${result.fee > 0 ? ` ${fmtPoints(result.fee)} paid.` : ""}${result.freePolicy ? " This week's free policy covers it." : ""}${
          convoy === "new" && result.convoyCode
            ? ` Convoy code ${result.convoyCode} — share it; a partner can join until the first fork opens.`
            : convoy
              ? " You're in the convoy: one clock, one set of forks."
              : ""
        }`,
      );
      router.refresh();
    });
  }

  function decide(run: ExpeditionRun, index: number, choice: ForkChoice) {
    setForkError(null);
    setBusyRun(run.id);
    startTransition(async () => {
      const result = await decideForkAction(run.id, index, choice);
      setBusyRun(null);
      if (!result.ok) {
        setForkError(result.error);
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
      const result = await claimExpeditionAction(run.id);
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
      });
      setClaimed((current) => new Set(current).add(run.id));
      router.refresh();
    });
  }

  function ransom(hold: LostHold) {
    setHoldError(null);
    setBusyRun(hold.holdId);
    startTransition(async () => {
      const result = await ransomLostCardAction(hold.holdId);
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
    setNotice(`Pick three cards and send a Rescue after ${byId.get(hold.cardId)?.playerName ?? "the card"}.`);
    launchRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="flex flex-col gap-8" data-testid="expedition-board">
      {/* ── Waiting on you ────────────────────────────────────────────── */}
      {openForks.length > 0 ? (
        <section aria-label="Forks waiting on you" className="flex flex-col gap-3">
          <h2 className="type-display text-2xl sm:text-3xl">Waiting on you</h2>
          <ul className="flex flex-col gap-3">
            {openForks.map(({ run, fork }) => (
              <ForkPrompt
                key={`${run.id}-${fork.index}`}
                run={run}
                fork={fork}
                copies={run.squad.map((id) => byId.get(id)).filter((copy): copy is CardCopy => Boolean(copy))}
                busy={pending && busyRun === run.id}
                rival={rivals[run.id] ?? null}
                convoy={convoys[run.id] ?? null}
                onDecide={(choice) => decide(run, fork.index, choice)}
              />
            ))}
          </ul>
          {forkError ? (
            <p data-testid="expedition-fork-error" className="text-sm text-red-400">
              {forkError}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ── Missing ───────────────────────────────────────────────────── */}
      {holds.length > 0 ? (
        <section aria-label="Missing cards" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="type-display text-2xl sm:text-3xl">Missing</h2>
            <span className="text-xs text-steel">
              A lost card stays yours, locked, for a week. Send a Rescue after it or pay the ransom. Either brings it home wounded.
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            {holds.map((hold) => (
              <MissingRow
                key={hold.holdId}
                hold={hold}
                copy={byId.get(hold.cardId)}
                busy={pending}
                onRescue={() => rescue(hold)}
                onRansom={() => ransom(hold)}
              />
            ))}
          </ul>
          {holdError ? (
            <p data-testid="expedition-hold-error" className="text-sm text-red-400">
              {holdError}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ── Today's brief ─────────────────────────────────────────────── */}
      <section
        data-testid="expedition-brief"
        className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-gold/50 bg-gold/10 px-4 py-3"
      >
        <span className="text-sm font-bold uppercase tracking-[0.14em] text-gold">Today&apos;s brief</span>
        <span className="text-sm font-semibold text-white">{brief.label} — +{Math.round(BRIEF_BONUS * 100)}% yield</span>
        <span className="text-xs text-steel">
          Send a {brief.role} with the squad and whatever they find pays {Math.round(BRIEF_BONUS * 100)}% more. The brief is scored
          against the day you LAUNCH, so a run keeps the bonus it left with.
        </span>
        {playingToday.length > 0 ? (
          <span data-testid="match-day" className="basis-full text-xs text-white">
            <span className="font-bold uppercase tracking-[0.14em] text-mint">Match day</span>{" "}
            {playingToday.join(", ")} {playingToday.length === 1 ? "plays" : "play"} tonight — a squad carrying one of their cards brings home{" "}
            +{Math.round(SURGE_BONUS * 100)}% on top.
          </span>
        ) : null}
        <a
          href="#expedition-rules"
          data-testid="fragments"
          title="Map fragments come home with Legend Hunts (every jackpot, some solid runs) and Deep Raid jackpots. Three open the Legendary route."
          className="ml-auto rounded-full border border-purple-300/60 bg-purple-500/10 px-3 py-1 font-mono text-xs font-bold text-purple-200 hover:bg-purple-500/20"
        >
          {fragments}/{EXPEDITION_TIERS.legendary.fragments} map fragment{fragments === 1 ? "" : "s"}
        </a>
      </section>

      {notice ? (
        <p role="status" data-testid="expedition-notice" className="rounded-md border border-mint/40 bg-mint/10 px-3 py-2 text-sm text-mint">
          {notice}
        </p>
      ) : null}

      {/* ── Squads in the field ───────────────────────────────────────── */}
      {active.length > 0 ? (
        <section aria-label="Expeditions in the field" className="flex flex-col gap-3">
          <h2 className="type-display text-2xl sm:text-3xl">In the field</h2>
          <ul className="flex flex-col gap-2">
            {active.map((run) => {
              const def = EXPEDITION_TIERS[run.tier as ExpeditionTierKey];
              return (
                <li key={run.id} data-testid={`run-${run.id}`} className="card-brand flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">
                  <div className="min-w-[9rem]">
                    <span className="label-dash">
                      {run.shine} shine{run.insured ? " · insured" : ""}
                      {run.encounters.some((entry) => entry.key === "storm") ? " · stormed" : ""}
                    </span>
                    {convoys[run.id] ? (
                      <span data-testid={`convoy-${run.id}`} className="block text-xs text-gold">
                        {convoys[run.id].partner
                          ? `Convoy with ${convoys[run.id].partner!.username}`
                          : `Convoy code ${convoys[run.id].code} — waiting for a partner`}
                      </span>
                    ) : null}
                    <p className="type-display mt-0.5 text-lg">{def?.label ?? run.tier}</p>
                  </div>
                  <div className="flex gap-2">
                    {run.squad.map((id) => (
                      <SquadThumb key={id} id={id} copy={byId.get(id)} />
                    ))}
                  </div>
                  <div className="ml-auto flex items-center gap-3">
                    <RunStatus
                      run={run}
                      label={def?.label ?? run.tier}
                      busy={pending}
                      claiming={busyRun === run.id}
                      onClaim={() => claim(run)}
                    />
                  </div>
                  <div className="basis-full">
                    <RunTrail run={run} copies={run.squad.map((id) => byId.get(id)).filter((copy): copy is CardCopy => Boolean(copy))} />
                  </div>
                </li>
              );
            })}
          </ul>
          {claimError ? (
            <p data-testid="expedition-claim-error" className="text-sm text-red-400">
              {claimError}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ── The rules ─────────────────────────────────────────────────── */}
      <ExpeditionRules />

      {/* ── The six runs ──────────────────────────────────────────────── */}
      <section ref={launchRef} aria-label="Expedition routes" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="type-display text-2xl sm:text-3xl">Choose a run</h2>
          <span className="text-xs text-steel">
            Every run takes {SQUAD_SIZE} cards. The button on each says which of yours can be hurt on it.
          </span>
        </div>

        {/* Options that apply to the launch, whatever the route. */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-line bg-panel/60 px-4 py-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={insured}
              onChange={(event) => setInsured(event.target.checked)}
              className="h-4 w-4 accent-[var(--color-gold)]"
            />
            <span className="text-white">Insure this run</span>
            <span className="text-xs text-steel">
              {freePolicy ? "free this week (patron)" : `${fmtPoints(INSURANCE_FEE)} at launch`} — lost becomes wounded, dead becomes lost
            </span>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-white">Convoy</span>
            <select
              data-testid="convoy-mode"
              value={convoyMode}
              onChange={(event) => setConvoyMode(event.target.value as "solo" | "new" | "join")}
              className="rounded-md border border-line bg-navy px-2 py-1 text-xs text-white"
            >
              <option value="solo">Go alone</option>
              <option value="new">Start a convoy — get a code</option>
              <option value="join">Join a convoy with a code</option>
            </select>
            {convoyMode === "join" ? (
              <input
                aria-label="Convoy code"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                maxLength={8}
                placeholder="ABC234"
                className="w-24 rounded-md border border-line bg-navy px-2 py-1 font-mono text-xs uppercase text-white"
              />
            ) : null}
            <span className="text-xs text-steel">
              {convoyMode === "solo"
                ? "two squads, one clock, one set of forks — a fork pushes only if you both push"
                : convoyMode === "new"
                  ? "a partner joins the same route with your code before the first fork opens"
                  : "the same route as the host, before their first fork opens"}
            </span>
          </label>
          {holds.length > 0 ? (
            <label className="flex items-center gap-2">
              <span className="text-white">Rescue target</span>
              <select
                value={rescueTarget ?? ""}
                onChange={(event) => setRescueTarget(event.target.value ? Number(event.target.value) : null)}
                className="rounded-md border border-line bg-navy px-2 py-1 text-xs text-white"
              >
                {holds.map((hold) => (
                  <option key={hold.holdId} value={hold.holdId}>
                    {byId.get(hold.cardId)?.playerName ?? `#${hold.cardId}`}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {afflictedInSquad.length > 0 ? (
            <label className="flex items-center gap-2">
              <span className="text-white">Cleanse</span>
              <select
                value={cleanseTarget ?? afflictedInSquad[0].id}
                onChange={(event) => setCleanseTarget(Number(event.target.value))}
                className="rounded-md border border-line bg-navy px-2 py-1 text-xs text-white"
              >
                {afflictedInSquad.map((copy) => (
                  <option key={copy.id} value={copy.id}>
                    {copy.playerName} ({copy.card?.mutation?.key})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {TIER_ORDER.map((key) => {
            const def = EXPEDITION_TIERS[key];
            const gate = squadMeets(key, squad, now);
            const isOut = tiersOut.has(key);
            const needsHold = def.target === "lost" && holds.length === 0;
            const needsAfflicted = def.target === "afflicted" && full && afflictedInSquad.length === 0;
            const shortFragments = def.fragments > fragments;
            const blocked = !gate.ok || isOut || needsHold || needsAfflicted || shortFragments || pending;
            const range = payoutRange(key);
            return (
              <article
                key={key}
                data-testid={`tier-${key}`}
                className={`card-brand flex flex-col gap-3 p-5 transition ${gate.ok && !isOut && !needsHold && !needsAfflicted && !shortFragments ? "border-mint/50" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="type-display text-xl">{def.label}</h3>
                    <p className="mt-0.5 text-xs uppercase tracking-wide text-steel">
                      {def.durationHours} hours away · {def.forks} fork{def.forks === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${RISK_CLASS[def.risk]}`}>
                    {RISK_LABEL[def.risk]}
                  </span>
                </div>
                <p className="text-sm text-steel">{def.what}</p>
                <p className="text-sm font-semibold text-white">
                  <span className="label-dash mr-2 inline-block">Entry</span>
                  <span>{requirementLine(def)}</span>
                </p>
                <p className="text-sm font-semibold text-white">
                  <span className="label-dash mr-2 inline-block">Pays</span>
                  {range.max === 0 ? (
                    <span className="text-steel">nothing — the card comes home clean</span>
                  ) : (
                    <>
                      <span className="font-mono text-mint">
                        {fmtPoints(range.min)}–{fmtPoints(range.max)}
                      </span>
                      <span className="ml-2 text-xs font-normal text-steel">
                        +{Math.round(SHINE_BONUS_CAP * 100)}% at most from shine, +{Math.round(BRIEF_BONUS * 100)}% for the brief, more for every push
                      </span>
                    </>
                  )}
                </p>
                {/* Consent, on the card, before the click. */}
                <p data-testid={`consent-${key}`} className={`text-xs ${def.risk === "none" ? "text-steel" : def.risk === "dead" ? "text-red-300" : "text-gold"}`}>
                  {consentLine(key, squad, insured && def.risk !== "none")}
                </p>
                {isOut ? (
                  <p data-testid={`tier-${key}-out`} className="text-xs text-gold">
                    Already in the field. One {def.label} at a time — bring this one home first.
                  </p>
                ) : null}
                {needsHold ? <p className="text-xs text-steel">Nothing is lost. A Rescue needs a card to go after.</p> : null}
                {needsAfflicted ? <p className="text-xs text-coral">Put a Haunted or Cursed card in the squad to cleanse it.</p> : null}
                {shortFragments ? (
                  <p className="text-xs text-coral">
                    Needs {def.fragments} map fragments — you hold {fragments}. They come home with Legend Hunts (every jackpot,{" "}
                    {Math.round((FRAGMENT_CHANCE.legend?.solid ?? 0) * 100)}% of solid runs) and Deep Raid jackpots ({Math.round((FRAGMENT_CHANCE.raid?.jackpot ?? 0) * 100)}%).
                  </p>
                ) : null}
                {gate.ok ? null : (
                  <ul className="flex flex-col gap-1">
                    {gate.reasons.map((reason) => (
                      <li key={reason} className="text-xs text-coral">
                        {reason}
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => launch(key)}
                  disabled={blocked}
                  aria-label={`Launch ${def.label}`}
                  className={`mt-auto px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${def.risk === "dead" ? "btn-pill border-red-400/70 text-red-200" : "btn-coral"}`}
                >
                  {busyTier === key ? "Sending…" : isOut ? "Still out there" : def.risk === "dead" ? "Send them in, knowing" : "Send them out"}
                </button>
              </article>
            );
          })}
        </div>
        {launchError ? (
          <p data-testid="expedition-error" className="text-sm text-red-400">
            {launchError}
          </p>
        ) : null}
      </section>

      {/* ── The squad picker ──────────────────────────────────────────── */}
      <section aria-label="Your squad" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="type-display text-2xl sm:text-3xl">Pick your squad</h2>
          <span data-testid="squad-shine" className="text-sm text-steel">
            <b className="font-semibold text-white">
              {picked.size}/{SQUAD_SIZE}
            </b>{" "}
            picked · <b className="font-semibold text-mint">{shine}</b> shine
          </span>
          {picked.size > 0 ? (
            <button
              type="button"
              onClick={() => setPicked(new Set())}
              className="text-xs text-steel underline-offset-4 hover:text-coral hover:underline"
            >
              Clear
            </button>
          ) : null}
        </div>
        {copies.length === 0 ? (
          <EmptyShelf base={base} goal="send a squad out" />
        ) : (
          <ul className="flex flex-wrap gap-2">
            {sorted.map((copy) => {
              const lost = holds.some((hold) => hold.cardId === copy.id);
              const deployed = deployedIds.has(copy.id) && !lost;
              const benchedUntil = woundedUntil(copy, now);
              const selected = picked.has(copy.id);
              const worth = shineOf(copy);
              const mutation = copy.card?.mutation ? mutationByKey(copy.card.mutation.key) : undefined;
              const sealed = Boolean(copy.card?.slab);
              const status = lost
                ? "lost"
                : deployed
                  ? "on expedition"
                  : sealed
                    ? "slabbed — sealed, never fielded again"
                    : benchedUntil
                      ? `wounded until ${easternClock(benchedUntil)} ET`
                      : null;
              return (
                <li key={copy.id}>
                  <button
                    type="button"
                    onClick={() => toggle(copy.id)}
                    disabled={deployed || lost || sealed || benchedUntil !== null || (!selected && full)}
                    aria-pressed={selected}
                    aria-label={`${copy.playerName} — ${worth} shine`}
                    title={status ? `${status[0].toUpperCase()}${status.slice(1)}.` : undefined}
                    className={`relative flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition disabled:cursor-not-allowed ${
                      selected
                        ? "border-coral bg-coral/15"
                        : "border-line bg-panel hover:border-coral/60 disabled:opacity-40 disabled:hover:border-line"
                    }`}
                    style={mutation ? { boxShadow: `inset 0 0 0 1px ${mutation.accent}66` } : undefined}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-xs font-semibold text-white">{copy.playerName}</span>
                      <span className="text-[10px] uppercase tracking-wide text-steel">
                        {tierLabel(copy.tier)}
                        {copy.role ? ` · ${copy.role}` : ""}
                        {mutation ? ` · ${mutation.label}` : ""}
                        {wearOf(copy.card) > 0 && !sealed ? ` · ${gradeOf(copy.card).label}` : ""}
                        {status ? ` · ${status}` : ""}
                      </span>
                    </span>
                    {(() => {
                      const key = cardTeamKey(copy);
                      return key !== null && playingKeys.has(key) ? (
                        <span
                          data-testid={`plays-${copy.id}`}
                          title={`${copy.card?.teamName} plays tonight — +${Math.round(SURGE_BONUS * 100)}% on the run`}
                          className="rounded-full border border-mint/60 bg-mint/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-mint"
                        >
                          tonight
                        </span>
                      ) : null;
                    })()}
                    {isProtected(copy) ? (
                      // The Eclipse is the one-of-one; a moment, a plate or a
                      // champions relic is protected the same way but is
                      // not unique, and a "1/1" on a plate read as a claim.
                      copy.foilType === "eclipse" ? (
                        <span aria-hidden title="One of one — never boards a route that can lose it" className="text-xs font-black text-purple-200">
                          1/1
                        </span>
                      ) : (
                        <span
                          aria-hidden
                          title="A relic — never boards a route that can lose it"
                          className="rounded-full border border-purple-300/50 px-1.5 text-[10px] font-bold uppercase tracking-wide text-purple-200"
                        >
                          relic
                        </span>
                      )
                    ) : null}
                    {copy.signed ? (
                      <span aria-hidden className="text-xs font-black text-gold">
                        ✍
                      </span>
                    ) : null}
                    {copy.foil ? (
                      <span aria-hidden className="text-xs font-black text-gold">
                        ✦
                      </span>
                    ) : null}
                    <span className="rounded-full border border-mint/50 bg-mint/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-mint">
                      +{worth}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── The log ───────────────────────────────────────────────────── */}
      {finished.length > 0 ? (
        <section aria-label="Finished expeditions" className="flex flex-col gap-3">
          <h2 className="type-display text-2xl sm:text-3xl">Field log</h2>
          <ul className="flex flex-col gap-1">
            {finished.map((run) => (
              <li
                key={run.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-panel px-3 py-1.5 text-xs"
              >
                <span className="font-semibold text-white">{EXPEDITION_TIERS[run.tier as ExpeditionTierKey]?.label ?? run.tier}</span>
                <span className="text-steel">
                  {new Date(run.startedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    timeZone: "America/New_York",
                  })}
                </span>
                {run.outcome ? (
                  <>
                    <span className="font-mono font-bold text-mint">{fmtPoints(run.outcome.dollars)}</span>
                    {run.outcome.pushes > 0 ? <span className="text-steel">×{run.outcome.lootMultiplier} from {run.outcome.pushes} push{run.outcome.pushes === 1 ? "" : "es"}</span> : null}
                    {run.outcome.surge.length > 0 ? <span className="text-mint">match day ×{1 + SURGE_BONUS}</span> : null}
                    {run.outcome.comp ? <span className="text-gold">free pack</span> : null}
                    {run.outcome.echo ? <span className="text-gold">a moment echoed</span> : null}
                    {run.outcome.fragments > 0 ? <span className="text-purple-200">map fragment</span> : null}
                    {run.outcome.mark ? (
                      <span className="text-gold">
                        {run.outcome.mark} mark
                        {run.outcome.bearer !== null && byId.get(run.outcome.bearer)
                          ? ` — ${byId.get(run.outcome.bearer)!.playerName}`
                          : ""}
                      </span>
                    ) : null}
                    {run.outcome.fates
                      .filter((fate) => fate.fate !== "home" || fate.mutation)
                      .map((fate) => (
                        <span key={fate.id} className={FATE_CLASS[fate.fate]}>
                          {byId.get(fate.id)?.playerName ?? `#${fate.id}`}{" "}
                          {fate.mutation ? mutationByKey(fate.mutation)?.label.toLowerCase() : FATE_LABEL[fate.fate].toLowerCase()}
                        </span>
                      ))}
                    {run.outcome.rescued === true ? <span className="text-mint">rescued</span> : null}
                    {run.outcome.rescued === false ? <span className="text-coral">rescue failed</span> : null}
                  </>
                ) : (
                  <span className="text-steel">claimed</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── The graveyard ─────────────────────────────────────────────── */}
      {graves.length > 0 ? (
        <section aria-label="Fallen cards" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="type-display text-2xl sm:text-3xl">The graveyard</h2>
            <span className="text-xs text-steel">Cards that did not come home. They stay here.</span>
          </div>
          <ul className="flex flex-wrap gap-2">
            {graves.map((grave) => (
              <li
                key={grave.id}
                data-testid={`grave-${grave.id}`}
                className="flex flex-col rounded-lg border border-red-500/40 bg-black/40 px-3 py-2 text-xs text-steel"
              >
                <span className="text-sm font-semibold text-white">{grave.playerName}</span>
                <span>
                  {tierLabel(grave.tier)}
                  {grave.foil ? " · foil" : ""}
                  {grave.signed ? " · signed" : ""}
                </span>
                <span className="text-red-300">
                  {grave.cause === "route" ? "Fell on the Legendary route" : "Lost, and nobody came"} ·{" "}
                  {new Date(grave.diedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {ceremony ? (
        <ClaimCeremony ceremony={ceremony} copies={byId} onClose={() => setCeremony(null)} />
      ) : null}
    </div>
  );
}

/**
 * What a run brought home, over the board: the dollars, every event on the
 * route, and every card with the state it came home in — drawn through
 * PlayerCard3D with the mutation it now wears.
 */
function ClaimCeremony({
  ceremony,
  copies,
  onClose,
}: {
  ceremony: Ceremony;
  copies: Map<number, CardCopy>;
  onClose: () => void;
}) {
  const { outcome, route, bearerId, balance, baseDollars, fragments, merchant, stranded, surge, echo } = ceremony;
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const bearer = bearerId === null ? undefined : copies.get(bearerId);
  const worn = bearer?.card?.expedition?.mark ?? null;
  const shownMark: ExpeditionMarkKind | null =
    outcome.mark && (!worn || MARK_RANK[outcome.mark] > MARK_RANK[worn]) ? outcome.mark : worn;

  const changed = route.fates.filter((fate) => fate.fate !== "home" || fate.mutation || fate.id === bearerId);
  const dead = route.fates.filter((fate) => fate.fate === "dead");
  const headline = dead.length > 0 ? (dead.length === route.fates.length ? "Nobody came home" : "Not everyone came home") : GRADE_HEADLINE[outcome.grade];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Expedition results"
      data-testid="expedition-ceremony"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/85 p-4"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="card-brand my-auto flex w-full max-w-3xl flex-col items-center gap-4 p-6 text-center"
      >
        <span className="label-dash">
          {route.rescued === true ? "Rescued" : route.rescued === false ? "The rescue failed" : route.cleansed !== null ? "Exorcised" : outcome.grade === "jackpot" ? "Jackpot" : "The squad is home"}
        </span>
        <h2 className="type-display text-3xl sm:text-4xl">{headline}</h2>

        {outcome.dollars > 0 ? (
          <>
            <p className="type-display text-4xl text-mint sm:text-5xl">
              <span aria-hidden>$</span>
              <CountUp value={outcome.dollars} />
              <span className="sr-only"> betting dollars</span>
            </p>
            <p className="text-xs text-steel">
              {route.lootMultiplier !== 1 ? `${fmtPoints(baseDollars)} × ${route.lootMultiplier} from the forks · ` : ""}
              {surge.length > 0 ? `× ${1 + SURGE_BONUS} match day · ` : ""}
              {merchant > 0 ? `+${fmtPoints(merchant)} from a merchant on the trail · ` : ""}Balance {fmtPoints(balance)}
            </p>
          </>
        ) : null}

        {outcome.briefHit ? (
          <p className="text-sm text-gold">
            {briefFor(easternDateOf(new Date(ceremony.run.startedAt))).label} — the brief paid +{Math.round(BRIEF_BONUS * 100)}%.
          </p>
        ) : null}
        {surge.length > 0 ? (
          <p data-testid="ceremony-surge" className="text-sm text-mint">
            {surge.join(" and ")} played on launch day — the match-day surge paid +{Math.round(SURGE_BONUS * 100)}%.
          </p>
        ) : null}
        {outcome.comp ? (
          <p className="text-sm text-gold">They came back with a free pack — it&apos;s waiting in the shop.</p>
        ) : null}
        {echo ? (
          <p data-testid="ceremony-echo" className="text-sm text-gold">
            The moment echoed. A copy of <strong className="text-white">{echo.playerName}</strong> from that game came home with them — it&apos;s on
            your shelf.
          </p>
        ) : null}
        {route.fragments > 0 ? (
          <p className="text-sm text-purple-200">A map fragment. You hold {fragments} — three open the Legendary route.</p>
        ) : null}
        {stranded ? (
          <p className="text-sm text-gold">
            They carried a stranger&apos;s lost card home. Its owner has it back, wounded, and you were paid a {fmtPoints(stranded.bounty)} bounty.
          </p>
        ) : null}

        {route.events.length > 0 ? (
          <ol data-testid="ceremony-events" className="flex w-full max-w-xl flex-col gap-1 text-left text-sm">
            {route.events.map((event, index) => (
              <li
                key={index}
                className={`rounded-md border px-3 py-1.5 ${
                  event.tone === "good" ? "border-mint/40 text-mint" : event.tone === "bad" ? "border-coral/50 text-coral" : "border-line text-steel"
                }`}
              >
                {event.text}
              </li>
            ))}
          </ol>
        ) : null}

        {changed.length > 0 ? (
          <div className="flex w-full flex-wrap justify-center gap-6">
            {changed.map((fate) => {
              const copy = copies.get(fate.id);
              if (!copy) return null;
              const mutated =
                fate.mutation && fate.fate !== "dead"
                  ? { ...copy.card, mutation: { key: fate.mutation, date: new Date().toISOString().slice(0, 10), run: ceremony.run.id } }
                  : copy.card;
              const card =
                fate.id === bearerId && shownMark
                  ? {
                      ...mutated,
                      expedition: {
                        mark: shownMark,
                        tier: copy.card?.expedition?.tier ?? "",
                        date: copy.card?.expedition?.date ?? new Date().toISOString().slice(0, 10),
                      },
                    }
                  : mutated;
              return (
                <div key={fate.id} data-testid={`fate-${fate.id}`} className={`flex flex-col items-center gap-2 ${fate.fate === "dead" ? "opacity-60 grayscale" : ""}`}>
                  <p className={`type-display text-lg ${FATE_CLASS[fate.fate]}`}>
                    {copy.playerName} — {fate.mutation ? mutationByKey(fate.mutation)?.label : FATE_LABEL[fate.fate]}
                    {fate.mutation && fate.fate !== "home" ? `, ${FATE_LABEL[fate.fate].toLowerCase()}` : ""}
                  </p>
                  <PlayerCard3D card={card} interactive forceFoil={copy.foil} foilType={copy.foilType} />
                  <p className="max-w-[20rem] text-xs text-steel">
                    {fate.fate === "dead"
                      ? "Gone for good. It rests in the graveyard."
                      : fate.fate === "lost"
                        ? "Did not come home. A week to rescue or ransom it."
                        : fate.fate === "wounded"
                          ? `Benched from expeditions and the Gauntlet until ${fate.woundedUntil ? easternClock(fate.woundedUntil) : "it heals"} ET.`
                          : fate.mutation
                            ? (mutationByKey(fate.mutation)?.tagline ?? "")
                            : `It wears the ${shownMark} mark from here on.`}
                  </p>
                </div>
              );
            })}
          </div>
        ) : null}

        <button ref={closeRef} type="button" onClick={onClose} className="btn-pill mt-2">
          Back to the board
        </button>
      </div>
    </div>
  );
}

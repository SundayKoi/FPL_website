"use client";

// The Gauntlet, played. One client component owning the whole run loop:
//
//   draft → fight (first half) → THE CROSSROADS (your call) → tape →
//   relic pick → fight → … → fallen/banked/cleared
//
// The server owns every outcome — this component renders the run row the
// actions hand back and never computes a fight itself. The one math it
// does run (previewCrossroadsChoice, compProfileOf) is the sim's own
// exported functions over the sim's own stored inputs, so what the choice
// cards print is exactly what the resolver will roll.

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtPoints } from "@/lib/betting/format";
import {
  benchSwapGauntletAction,
  bankGauntletRunAction,
  chooseGauntletPathAction,
  dealGauntletHandAction,
  rerollGauntletOfferAction,
  fightGauntletRoundAction,
  pickGauntletRelicAction,
  resetGauntletRunAction,
  startGauntletRunAction,
} from "@/lib/gauntlet/actions";
import { CHOICE_BY_KEY, CROSSROADS_BY_KEY, crossroadsSpread, daringAt, winChanceOf } from "@/lib/gauntlet/crossroads";
import MatchTheatre from "./MatchTheatre";
import { AutopsyPanel, Scoreboard } from "./MatchAutopsy";
import ScoutingReport from "./ScoutingReport";
import {
  GAUNTLET_ENTRY_FEE,
  type GauntletRunRow,
  matchContextFor,
  type StoredMatchResult,
} from "@/lib/gauntlet/run";
import { PURSE_MAX, canBank, purseStep } from "@/lib/gauntlet/purse";
import { ASCENSION_LEVELS, ASCENSION_PURSE_STEP, ASCENSION_SCORE_STEP, ascensionRules } from "@/lib/gauntlet/ascension";
import { contractsForWeek } from "@/lib/gauntlet/contracts";
import { OPENER_BY_KEY, nextOpener, unlockedOpeners } from "@/lib/gauntlet/openers";
import { DRAFTED_SCORE_MULT } from "@/lib/gauntlet/drafted";
import { SET_BONUS_AT, SET_BONUS_TEXT, completedSets } from "@/lib/gauntlet/relics";
import type { GauntletOption, HeirloomOption } from "@/lib/gauntlet/queries";
import { heirloomBlurb, plateMatches } from "@/lib/gauntlet/heirlooms";
import type { MomentFamily } from "@/lib/cards/moments";
import { RELIC_BY_KEY, RELIC_CATALOG, type RelicFamily, type RelicRarity } from "@/lib/gauntlet/relics";
import {
  type CompStyle,
  lineupShapeOf,
  FRESH_LEGS_BONUS,
  GAUNTLET_ROLES,
  GAUNTLET_ROUNDS,
  type GauntletCard,
  type GauntletRole,
  LANE_KEY,
  makeTrialist,
  mulberry32,
  previewCrossroadsChoice,
  simulateSecondHalf,
} from "@/lib/gauntlet/sim";

/** Rarity reads at a glance on the pick screen — steel, cyan, gold. */
const RARITY_COLOR: Record<RelicRarity, string> = {
  common: "#a7c0d8",
  uncommon: "#35e6ff",
  rare: "#f5b62e",
};

const FAMILY_COLOR: Record<RelicFamily, string> = {
  ember: "#ff7a3d",
  void: "#9b6dff",
  ice: "#a8e6ff",
  gold: "#e8c14b",
};

/** What each identity beats — the sim's triangle, for the readout line. */
const BEATS: Record<CompStyle, CompStyle> = { poke: "dive", dive: "protect", protect: "poke" };

function MomentumBar({ value }: { value: number }) {
  return (
    <div>
      <div className="h-2.5 overflow-hidden rounded-full border border-border-subtle bg-[#3a2030]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#2b6cb0] to-mint transition-all"
          style={{ width: `${value}%` }}
        />
      </div>
      <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted">Momentum · {value}%</p>
    </div>
  );
}

function LineupRow({ lineup }: { lineup: GauntletRunRow["lineup"] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {lineup.map((card) => (
        <div
          key={`${card.role}-${card.inventoryId ?? "trialist"}`}
          className={`w-[104px] rounded-lg border px-2.5 py-2 ${card.trialist ? "border-dashed border-border-subtle bg-surface/60" : "border-[#3d4a6b] bg-[#141c30]"}`}
        >
          <p className="text-[8px] uppercase tracking-[0.2em] text-muted">{card.role}</p>
          <p className="truncate text-[12px] font-bold text-white">{card.name}</p>
          <p className="font-mono text-sm font-extrabold text-mint">
            {card.overall}
            <span className="ml-1 text-[10px] font-normal text-gold">
              {card.fresh ? "🌱" : ""}
              {card.foil ? "✦" : ""}
              {card.signed ? "✍" : ""}
            </span>
          </p>
        </div>
      ))}
    </div>
  );
}

function RelicChip({ relicKey }: { relicKey: string }) {
  const relic = RELIC_BY_KEY.get(relicKey);
  if (!relic) return null;
  const color = FAMILY_COLOR[relic.family];
  return (
    <span
      className="rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide"
      style={{
        color,
        borderColor: relic.rarity === "rare" ? "#f5b62e" : `${color}80`,
        background: `${color}14`,
      }}
      title={`${relic.rarity.toUpperCase()} · ${relic.effect}`}
    >
      {relic.title}
    </span>
  );
}

/** Which beats each identity is paid on — mirrors FOCUS_BEATS in the sim. */
const FOCUS_LABEL: Record<CompStyle, string> = {
  poke: "lanes & objectives",
  dive: "fights & the crossroads",
  protect: "the hold & the Baron",
};

/** The draft's readout — the SAME numbers the sim reads, including what
 *  the lineup's SHAPE is worth. This is the whole reason to draft a five
 *  instead of sorting by overall, so it can't be hidden. */
function CompReadout({ cards }: { cards: GauntletCard[] }) {
  const shape = lineupShapeOf(cards);
  const { profile, style } = shape;
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border-subtle/60 bg-surface/40 p-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted">Comp readout</span>
        {(["poke", "dive", "protect"] as CompStyle[]).map((key) => (
          <span key={key} className={`font-mono text-xs ${key === style ? "font-bold text-mint" : "text-muted"}`}>
            {key} {profile[key]}
          </span>
        ))}
      </div>
      <p className="text-xs text-muted">
        Reads as <b className="uppercase text-white">{style}</b> — wins the draft read into{" "}
        <b className="uppercase">{BEATS[style]}</b>, loses it to <b className="uppercase">{BEATS[BEATS[style]]}</b>.
      </p>

      <div className="grid gap-2 border-t border-border-subtle/50 pt-2.5 sm:grid-cols-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted">
            Commitment <span className="font-mono text-white">{shape.commitment}</span>
          </p>
          <p className="mt-0.5 text-xs">
            {shape.focusBonus > 0 ? (
              <span className="text-mint">
                +{shape.focusBonus.toFixed(1)} on {FOCUS_LABEL[style]}
              </span>
            ) : (
              <span className="text-muted">
                Nothing yet — five bests with nothing in common commit to nothing. Lean the shape.
              </span>
            )}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted">
            Chemistry <span className="font-mono text-white">{shape.chemistry}/5</span>
          </p>
          <p className="mt-0.5 text-xs">
            {shape.chemistryBonus > 0 ? (
              <span className="text-mint">+{shape.chemistryBonus.toFixed(1)} on every check</span>
            ) : (
              <span className="text-muted">No real-life teammates fielded.</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function GauntletClient({
  initialRun,
  options,
  balance,
  weekBest,
  lastLineup,
  heirlooms,
  ascensionUnlocked = 0,
  week = "",
  contractsDone = [],
  contractsSeason = 0,
}: {
  initialRun: GauntletRunRow | null;
  options: Record<GauntletRole, GauntletOption[]>;
  balance: number;
  weekBest: number;
  /** The inventory ids fielded in the previous run. A re-run has to move
   *  at least one card, and the draft screen says so up front rather than
   *  letting the entry be refused after the fact. */
  lastLineup: number[];
  /** Moments and roster plates on the shelf — a run may bring one. */
  heirlooms: HeirloomOption[];
  /** The top of the ladder this player has unlocked this season. */
  ascensionUnlocked?: number;
  /** Monday of the week — the contracts rotate on it. */
  week?: string;
  /** Contract keys finished this week, and the season's running count
   *  (which unlocks openers). */
  contractsDone?: string[];
  contractsSeason?: number;
}) {
  const router = useRouter();
  const [run, setRun] = useState<GauntletRunRow | null>(initialRun);
  // The fight just resolved this visit — shown above whatever comes next.
  const [lastFight, setLastFight] = useState<StoredMatchResult | null>(initialRun?.last_result ?? null);
  // The autopsy waits for the tape to finish — a verdict on screen before
  // the game that earned it has played is a spoiler.
  // A run loaded from the server has nothing to watch — its post-match
  // screens show immediately. A round resolved in THIS session holds them
  // back until the tape has played out.
  const [tapeDone, setTapeDone] = useState(true);
  const [justPlayed, setJustPlayed] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);

  /** Bring the stage back into view — a new screen rendered below the
   *  fold is a screen the player never sees. */
  const showStage = useCallback(() => {
    requestAnimationFrame(() => {
      stageRef.current?.scrollIntoView({
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    });
  }, []);
  const [picks, setPicks] = useState<Partial<Record<GauntletRole, number | null>>>({});
  /** The shelf relic coming along, if any. Null is a real answer — most
   *  runs bring nothing, and the picker must never imply otherwise. */
  const [heirloomId, setHeirloomId] = useState<number | null>(null);
  /** The level to draft at. Defaults to the top unlocked — the ladder is
   *  for climbing — and a player can always step back down. */
  const [ascension, setAscension] = useState<number>(ascensionUnlocked);
  /** The opener to bring. Null brings nothing — most runs will. */
  const [openerKey, setOpenerKey] = useState<string | null>(null);
  /** Drafted mode: the hand dealt, when one is. Null drafts from the shelf. */
  const [deal, setDeal] = useState<{ dealId: number; ids: number[] } | null>(null);
  /** Contracts finished by the round that just resolved, for the strip
   *  under the tape. */
  const [contractNews, setContractNews] = useState<{ key: string; title: string; reward: number }[]>([]);
  /** Keys finished this week, as this session knows them — the server's
   *  list plus whatever the rounds played here just paid. */
  const [doneKeys, setDoneKeys] = useState<string[]>(contractsDone);
  const weekContracts = week ? contractsForWeek(week) : [];
  const openers = unlockedOpeners(contractsSeason);
  const upcoming = nextOpener(contractsSeason);
  const [swapOut, setSwapOut] = useState<number | "">("");
  const [swapIn, setSwapIn] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** The same five as last time? Compared as a SET of inventory ids, the
   *  same way the server compares them — moving a card between roles is
   *  not a new lineup. */
  const repeatsLast = useMemo(() => {
    if (lastLineup.length === 0) return false;
    const now = GAUNTLET_ROLES.map((role) => picks[role]).filter((id): id is number => typeof id === "number");
    if (now.length !== lastLineup.length) return false;
    const previous = [...lastLineup].sort((a, b) => a - b).join("|");
    return [...now].sort((a, b) => a - b).join("|") === previous;
  }, [lastLineup, picks]);

  /** The would-be lineup as sim cards — overall AND bars, so the readout
   *  runs the sim's own functions on the sim's own inputs. */
  const draftCards = useMemo<GauntletCard[]>(
    () =>
      GAUNTLET_ROLES.map((role) => {
        const id = picks[role];
        const option = typeof id === "number" ? options[role].find((o) => o.inventoryId === id) : null;
        if (!option) return makeTrialist(role);
        return {
          inventoryId: option.inventoryId,
          name: option.name,
          role,
          overall: option.overall,
          stats: option.stats,
          foil: option.foil,
          signed: option.signed,
          fresh: option.fresh,
          team: option.team,
        };
      }),
    [picks, options],
  );
  /** What the chosen relic is doing, read against the five on screen —
   *  a plate's whole value is conditional on who you brought, so the line
   *  has to update as the draft changes. */
  const chosenHeirloomBlurb = useMemo(() => {
    const option = heirlooms.find((entry) => entry.inventoryId === heirloomId);
    if (!option) return null;
    const stored = {
      inventoryId: option.inventoryId,
      kind: option.kind,
      title: option.title,
      family: option.family as MomentFamily | undefined,
      teamName: option.teamName,
    };
    return heirloomBlurb(stored, plateMatches(stored, draftCards));
  }, [heirloomId, heirlooms, draftCards]);

  const draftAvg = useMemo(() => {
    const overalls = draftCards.map((card) => card.overall);
    return Math.round((overalls.reduce((a, b) => a + b, 0) / overalls.length) * 10) / 10;
  }, [draftCards]);

  function start() {
    setError(null);
    startTransition(async () => {
      const result = await startGauntletRunAction(picks, heirloomId, ascension, openerKey, deal?.dealId ?? null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLastFight(null);
      setRun(result.run);
      setDeal(null);
      // The header's attempts/best strip is server-rendered — let it catch up.
      router.refresh();
    });
  }

  /** Drafted mode: deal a hand, and draft from it. */
  function dealHandNow() {
    setError(null);
    startTransition(async () => {
      const result = await dealGauntletHandAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDeal({ dealId: result.dealId, ids: result.ids });
      setPicks({});
    });
  }

  /** THE REMATCH: re-roll the offer once. */
  function reroll() {
    if (!run) return;
    setError(null);
    startTransition(async () => {
      const result = await rerollGauntletOfferAction(run.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRun(result.run);
    });
  }

  function fight() {
    if (!run) return;
    setError(null);
    startTransition(async () => {
      const result = await fightGauntletRoundAction(run.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // The game is now paused at the crossroads — the old tape comes down.
      setLastFight(null);
      setJustPlayed(false);
      setTapeDone(true);
      setRun(result.run);
      showStage();
    });
  }

  function choose(choiceKey: string) {
    if (!run) return;
    setError(null);
    startTransition(async () => {
      const result = await chooseGauntletPathAction(run.id, choiceKey);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTapeDone(false);
      setJustPlayed(true);
      setContractNews(result.contracts ?? []);
      if (result.contracts?.length) setDoneKeys((current) => [...current, ...result.contracts.map((entry) => entry.key)]);
      setLastFight(result.run.last_result ?? { ...result.result, round: run.round });
      setRun(result.run);
      showStage();
      router.refresh();
    });
  }

  function pick(relicKey: string) {
    if (!run) return;
    setError(null);
    startTransition(async () => {
      const result = await pickGauntletRelicAction(run.id, relicKey);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRun(result.run);
    });
  }

  function reset() {
    if (!run) return;
    const purse = run.purse ?? 0;
    const banking = canBank(run);
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        banking
          ? `Bank ${fmtPoints(purse)} and end the run? The purse is paid to your wallet; the entry fee stays in the week's pot and the score you've already won stands on the board.`
          : `Walk away mid-fight? The purse (${fmtPoints(purse)}) is on the table and you FORFEIT it. No refund, no reward; the score you've already won stands on the board.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await resetGauntletRunAction(run.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRun({ ...run, status: "banked", relic_offer: null, crossroads: null, score: result.score, purse_paid: result.paid });
      router.refresh();
    });
  }

  /** Bank between fights, or collect a cleared run's purse if the clear
   *  itself failed to pay it. */
  function bank() {
    if (!run) return;
    setError(null);
    startTransition(async () => {
      const result = await bankGauntletRunAction(run.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRun(result.run);
      router.refresh();
    });
  }

  function benchSwap() {
    if (!run || swapOut === "" || swapIn === "") return;
    setError(null);
    startTransition(async () => {
      const result = await benchSwapGauntletAction(run.id, Number(swapOut), Number(swapIn));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRun(result.run);
      setSwapOut("");
      setSwapIn("");
    });
  }

  // ── No run: the draft table.
  if (!run) {
    const short = balance < GAUNTLET_ENTRY_FEE;
    return (
      <section className="card-brand flex flex-col gap-5 p-6">
        <div>
          <span className="label-dash">Draft your five</span>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            One per role, from your shelf. 🌱 marks this week&apos;s prints — they fight at +{FRESH_LEGS_BONUS}. A
            role you can&apos;t cover fields a 55-rated trialist (and taxes your score). The bracket mostly
            scales to your average, so a stronger shelf helps a little — but <b className="text-white">a
            committed shape and real-life teammates help more</b>. Five bests with nothing in common commit
            to nothing.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {GAUNTLET_ROLES.map((role, index) => {
            const card = draftCards[index];
            return (
              <label key={role} className="flex flex-col gap-1 text-xs text-muted">
                <span className="label-dash">{role}</span>
                <select
                  className="input-brand px-2 py-2 text-sm"
                  value={picks[role] ?? ""}
                  onChange={(event) =>
                    setPicks((prev) => ({ ...prev, [role]: event.target.value === "" ? null : Number(event.target.value) }))
                  }
                >
                  <option value="">Trialist (55)</option>
                  {options[role].filter((option) => !deal || deal.ids.includes(option.inventoryId)).map((option) => (
                    <option key={option.inventoryId} value={option.inventoryId}>
                      {option.name} · {option.overall}
                      {/* Both shelves field, so the option has to say which
                          one it came off — an academy 80 and a premier 80
                          are rated against different fields. */}
                      {option.league === "academy" ? " · ACA" : ""}
                      {option.fresh ? " 🌱" : ""}
                      {option.foil ? " ✦" : ""}
                      {option.signed ? " ✍" : ""}
                    </option>
                  ))}
                </select>
                <span className="font-mono text-[10px] text-muted">
                  {card.trialist
                    ? "warm body · −40 score/round"
                    : `${LANE_KEY[role]} ${card.stats[LANE_KEY[role]] ?? "~" + Math.max(30, card.overall - 5)} · combat ${card.stats.combat ?? "~" + Math.max(30, card.overall - 5)} · damage ${card.stats.damage ?? "~" + Math.max(30, card.overall - 5)}`}
                </span>
                {card.team ? <span className="truncate text-[10px] text-muted/80">{card.team}</span> : null}
              </label>
            );
          })}
        </div>
        <CompReadout cards={draftCards} />
        {heirlooms.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="label-dash">Bring a relic — optional</span>
            <p className="text-xs text-muted">
              A moment or a roster plate can come along. It takes no role and never fights; it hands the run a
              small edge and stays on the shelf afterwards. The bracket is priced off your five, so this is an
              edge rather than a tax.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={heirloomId === null}
                onClick={() => setHeirloomId(null)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  heirloomId === null ? "bg-gold text-canvas" : "border border-border-subtle bg-surface text-muted hover:text-white"
                }`}
              >
                Bring nothing
              </button>
              {heirlooms.map((option) => (
                <button
                  key={option.inventoryId}
                  type="button"
                  aria-pressed={heirloomId === option.inventoryId}
                  onClick={() => setHeirloomId(option.inventoryId)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    heirloomId === option.inventoryId
                      ? "bg-gold text-canvas"
                      : "border border-border-subtle bg-surface text-muted hover:text-white"
                  }`}
                >
                  {option.kind === "moment" ? "✦ " : "▦ "}
                  {option.title}
                </button>
              ))}
            </div>
            {chosenHeirloomBlurb ? (
              <p className="font-mono text-[11px] leading-4 text-gold">↳ {chosenHeirloomBlurb}</p>
            ) : null}
          </div>
        ) : null}
        <div data-testid="drafted-mode" className="flex flex-wrap items-center gap-3 rounded-lg border border-border-subtle bg-surface/50 px-3 py-2">
          <span className="label-dash">Drafted mode</span>
          <span className="text-xs text-muted">
            {deal
              ? `You were dealt ${deal.ids.length} cards — build from those. The board pays a drafted run ×${DRAFTED_SCORE_MULT}, and the no-repeat rule is waived.`
              : `Deal a hand — three random cards per role from your own shelf — and draft from those instead of your best five. The board pays it ×${DRAFTED_SCORE_MULT}.`}
          </span>
          <button
            type="button"
            onClick={deal ? () => { setDeal(null); setPicks({}); } : dealHandNow}
            disabled={pending}
            className="ml-auto rounded-full border border-border-strong bg-surface px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted transition hover:border-action-text hover:text-action-text disabled:opacity-50"
          >
            {deal ? "Draft from the whole shelf instead" : "Deal me a hand"}
          </button>
        </div>
        {weekContracts.length > 0 ? (
          <div data-testid="contracts" className="flex flex-col gap-2 rounded-lg border border-mint/40 bg-mint/5 p-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="label-dash text-mint">This week&apos;s contracts</span>
              <span className="text-xs text-muted">
                Three things to go and do. Each pays once a week, the first time a round you win does it — and every one
                finished counts toward your openers ({contractsSeason} this season).
              </span>
            </div>
            <ul className="grid gap-2 sm:grid-cols-3">
              {weekContracts.map((contract) => {
                const done = doneKeys.includes(contract.key);
                return (
                  <li
                    key={contract.key}
                    data-testid={`contract-${contract.key}`}
                    className={`rounded-lg border px-3 py-2 text-xs ${done ? "border-mint/60 bg-mint/10" : "border-border-subtle bg-surface/50"}`}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <b className={done ? "text-mint" : "text-white"}>{contract.title}</b>
                      <span className="font-mono text-gold">{done ? "paid" : `+${fmtPoints(contract.reward)}`}</span>
                    </span>
                    <span className="mt-0.5 block text-muted">{contract.blurb}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        <div data-testid="opener-picker" className="flex flex-col gap-2">
          <span className="label-dash">Opener — optional</span>
          <p className="text-xs text-muted">
            A small starting perk, kept for the season, unlocked by contracts finished — the only permanent
            power in the Gauntlet.{" "}
            {upcoming
              ? `Next: ${upcoming.opener.title} at ${upcoming.opener.unlockAt} contracts (${upcoming.remaining} to go).`
              : "You have unlocked every opener."}
          </p>
          {openers.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={openerKey === null}
                onClick={() => setOpenerKey(null)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  openerKey === null ? "bg-gold text-canvas" : "border border-border-subtle bg-surface text-muted hover:text-white"
                }`}
              >
                Bring nothing
              </button>
              {openers.map((opener) => (
                <button
                  key={opener.key}
                  type="button"
                  aria-pressed={openerKey === opener.key}
                  title={opener.effect}
                  onClick={() => setOpenerKey(opener.key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    openerKey === opener.key ? "bg-gold text-canvas" : "border border-border-subtle bg-surface text-muted hover:text-white"
                  }`}
                >
                  ◆ {opener.title}
                </button>
              ))}
            </div>
          ) : null}
          {openerKey ? (
            <p className="font-mono text-[11px] leading-4 text-gold">↳ {OPENER_BY_KEY.get(openerKey)?.effect}</p>
          ) : null}
        </div>
        <div data-testid="ascension-picker" className="flex flex-col gap-2">
          <span className="label-dash">Ascension</span>
          <p className="text-xs text-muted">
            {ascensionUnlocked === 0
              ? "Clear all eight rounds and the next level of the ladder opens for the season: a named rule change on top of everything below it. The board weighs a run by its level."
              : `You have unlocked ascension ${ascensionUnlocked}. Each level is a rule on top of the ones before it; the board and the purse pay +${Math.round(ASCENSION_SCORE_STEP * 100)}% and +${Math.round(ASCENSION_PURSE_STEP * 100)}% a level.`}
          </p>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: ascensionUnlocked + 1 }, (_, level) => (
              <button
                key={level}
                type="button"
                aria-pressed={ascension === level}
                onClick={() => setAscension(level)}
                className={`rounded-full px-3 py-1.5 font-mono text-xs font-bold transition ${
                  ascension === level ? "bg-coral text-canvas" : "border border-border-subtle bg-surface text-muted hover:text-white"
                }`}
              >
                {level === 0 ? "A0 · the Gauntlet" : `A${level} · ${ASCENSION_LEVELS[level - 1].title}`}
              </button>
            ))}
          </div>
          {ascension > 0 ? (
            <ul className="flex flex-col gap-1 font-mono text-[11px] leading-4 text-coral">
              {ASCENSION_LEVELS.slice(0, ascension).map((entry) => (
                <li key={entry.level}>
                  A{entry.level} · <b>{entry.title}</b> — {entry.rule}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {repeatsLast && !deal ? (
          <p className="rounded-lg border border-gold/45 bg-gold/5 px-3 py-2 text-xs leading-5 text-gold">
            This is the same five you ran last time. Move at least one card — a re-run should be a different
            run, not the same one rolled again.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" onClick={start} disabled={pending || short || (repeatsLast && !deal)} className="btn-primary px-5 py-2.5 text-sm disabled:opacity-50">
            {pending ? "Entering…" : `Enter the Gauntlet — ${fmtPoints(GAUNTLET_ENTRY_FEE)}`}
          </button>
          <span className="text-xs text-muted">
            Lineup average {draftAvg} · bracket starts just under it, ends well over
            {short ? ` · your wallet is short (${fmtPoints(balance)})` : ""}
          </span>
        </div>
        {weekBest > 0 ? (
          <p className="text-xs text-muted">Your best this week: <b className="text-white">{weekBest.toLocaleString()}</b> — a new run can beat it.</p>
        ) : null}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </section>
    );
  }

  const over = run.status !== "active";
  const offering = run.status === "active" && run.relic_offer;
  // Held relics grouped by family, biggest first — the build, as a line of
  // chips above the three on offer.
  const heldFamilies = (() => {
    const counts = new Map<RelicFamily, number>();
    for (const key of run.relics ?? []) {
      const relic = RELIC_BY_KEY.get(key);
      if (relic) counts.set(relic.family, (counts.get(relic.family) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  })();
  /** The relic this run brought, read against the five it fielded. */
  const runHeirloom = run.heirloom ?? null;
  const runHeirloomBlurb = runHeirloom
    ? heirloomBlurb(runHeirloom, plateMatches(runHeirloom, run.lineup))
    : null;
  const atCrossroads = run.status === "active" && run.crossroads && run.next_opponent;
  const canSwap =
    offering && run.relics.includes("sixth_man") && !run.bench_swap_used;
  const swapRole = run.lineup.find((card) => card.inventoryId === Number(swapOut))?.role;
  const situation = atCrossroads ? CROSSROADS_BY_KEY.get(run.crossroads!.state.situationKey) ?? null : null;
  // A ghost brought a decision to this game, not just a stat line. Their
  // call is shown BEFORE yours: answering a real one is the whole mode.
  const theirCallKey = atCrossroads ? run.next_opponent?.ghost?.choiceKey ?? null : null;
  const theirCall = theirCallKey ? CHOICE_BY_KEY.get(theirCallKey) ?? null : null;
  // The same context the server fights under — relics, their traits, the
  // round's condition — so the odds printed on a choice are the odds.
  const runCtx = matchContextFor(
    run.relics, run.next_opponent, undefined, run.heirloom, run.lineup, run.ascension ?? 0, run.opener ?? null,
  );

  return (
    <section ref={stageRef} className="flex scroll-mt-6 flex-col gap-6">
      <div className="card-brand flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-baseline gap-4">
          <span className="label-dash">
            {over
              ? `RUN ${run.status === "banked" ? "BANKED" : run.status.toUpperCase()}`
              : `ROUND ${run.round} OF ${GAUNTLET_ROUNDS}`}
            {(run.ascension ?? 0) > 0 ? ` · ASCENSION ${run.ascension}` : ""}
            {run.drafted ? " · DRAFTED" : ""}
          </span>
          <span className="font-mono text-xl font-bold">{run.score.toLocaleString()}</span>
          <span className="text-xs text-muted">run score</span>
          <span
            data-testid="purse"
            className={`rounded-full border px-2.5 py-0.5 font-mono text-sm font-bold ${
              over && (run.purse_paid ?? 0) === 0 && (run.purse ?? 0) > 0 ? "border-coral/50 text-coral line-through" : "border-gold/50 text-gold"
            }`}
            title="The purse: real dollars, banked between fights or lost with the run"
          >
            {fmtPoints(run.purse ?? 0)}
          </span>
          <span className="text-xs text-muted">purse{over ? ((run.purse_paid ?? 0) > 0 ? " · paid" : (run.purse ?? 0) > 0 ? " · lost" : "") : ""}</span>
          {run.relics.length > 0 || run.opener ? (
            <span className="ml-auto flex flex-wrap gap-1.5">
              {run.opener && OPENER_BY_KEY.has(run.opener) ? (
                <span
                  title={OPENER_BY_KEY.get(run.opener)!.effect}
                  className="rounded-full border border-gold/50 bg-gold/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-gold"
                >
                  ◆ {OPENER_BY_KEY.get(run.opener)!.title}
                </span>
              ) : null}
              {run.relics.map((key) => (
                <RelicChip key={key} relicKey={key} />
              ))}
            </span>
          ) : null}
        </div>
        <LineupRow lineup={run.lineup} />
        {completedSets(run.relics).length > 0 ? (
          <p data-testid="set-bonus" className="font-mono text-[11px] leading-4 text-gold">
            {completedSets(run.relics).map((family) => `${family.toUpperCase()} SET (${SET_BONUS_AT}): ${SET_BONUS_TEXT[family]}`).join(" · ")}
          </p>
        ) : null}
        {run.second_wind_used && run.status === "active" && lastFight && !lastFight.won ? (
          <p data-testid="second-wind" className="rounded-lg border border-[#ff7a3d]/60 bg-[#ff7a3d]/10 px-3 py-2 text-xs text-[#ff7a3d]">
            THE SECOND WIND — the round is lost, the run is not. Round {run.round} again, against a fresh opponent. It does not
            happen twice.
          </p>
        ) : null}
        {(run.ascension ?? 0) > 0 ? (
          <p data-testid="ascension-rules" className="font-mono text-[11px] leading-4 text-coral">
            {ASCENSION_LEVELS.slice(0, ascensionRules(run.ascension ?? 0).level)
              .map((entry) => `A${entry.level} ${entry.title}: ${entry.rule}`)
              .join(" · ")}
          </p>
        ) : null}
        {!over ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle/40 pt-3">
            <button
              type="button"
              onClick={reset}
              disabled={pending}
              className="rounded-full border border-border-strong bg-surface px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted transition hover:border-action-text hover:text-action-text disabled:opacity-50"
            >
              {canBank(run) ? `Bank ${fmtPoints(run.purse ?? 0)} and end the run` : "Walk away — forfeit the purse"}
            </button>
            <span className="text-[11px] text-muted">
              {canBank(run)
                ? "Between fights the purse is yours to take. The fee stays in the pot; the score already won stands on the board."
                : "The first half has been played: the purse is on the table until the whistle. Leaving now pays nothing."}
            </span>
          </div>
        ) : null}
      </div>

      {lastFight ? (
        <div className="flex flex-col gap-4">
          <MatchTheatre
            key={`tape-${lastFight.round}-${lastFight.momentum}`}
            title={`Round ${lastFight.round} — the tape`}
            tape={{
              events: lastFight.events,
              contests: lastFight.contests ?? [],
              goldSeries: lastFight.goldSeries ?? [{ clock: 0, diff: 0 }],
              baron: lastFight.baron,
              endClock: 31,
            }}
            autoPlay={justPlayed}
            onFinish={() => setTapeDone(true)}
          />
          {!tapeDone ? (
            <p className="text-xs text-muted">
              The scoreboard, the read, and what comes next unlock when the tape ends — or hit Skip.
            </p>
          ) : null}
          {tapeDone ? (
            <div className="flex flex-col gap-4">
              {lastFight.won ? (
                <p className="text-xs text-muted">
                  MVP <b className="text-white">{lastFight.mvp}</b> · +{lastFight.score.toLocaleString()} score
                  {lastFight.daring > 0 ? (
                    <span className="text-gold"> (of which {lastFight.daring} daring — the call landed)</span>
                  ) : null}
                </p>
              ) : null}
              {contractNews.length > 0 ? (
                <p data-testid="contract-news" className="rounded-lg border border-mint/50 bg-mint/10 px-3 py-2 text-xs text-mint">
                  Contract{contractNews.length === 1 ? "" : "s"} complete:{" "}
                  {contractNews.map((entry) => `${entry.title} (+${fmtPoints(entry.reward)})`).join(", ")} — paid to your wallet.
                </p>
              ) : null}
              {lastFight.players?.length ? (
                <Scoreboard players={lastFight.players} mvp={lastFight.mvp} />
              ) : null}
              {lastFight.autopsy ? <AutopsyPanel autopsy={lastFight.autopsy} won={lastFight.won} /> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {!tapeDone ? null : over ? (
        <div className="card-brand flex flex-col items-start gap-3 p-6">
          <span className="label-dash">
            {run.status === "cleared" ? "🏆 FULL CLEAR" : run.status === "banked" ? "You walked away" : "The run ends here"}
          </span>
          <p className="text-sm text-muted">
            {run.status === "cleared"
              ? `Eight rounds, no falls. The board will remember${(run.purse_paid ?? 0) > 0 ? `, and the full purse (${fmtPoints(run.purse_paid ?? 0)}) is in your wallet` : ""}.`
              : run.status === "banked"
                ? (run.purse_paid ?? 0) > 0
                  ? `You banked ${fmtPoints(run.purse_paid ?? 0)} — it's in your wallet. The score you'd already won stands on the board.`
                  : "Nothing paid, nothing owed — the score you'd already won stands on the board."
                : `The Gauntlet keeps what it takes${(run.purse ?? 0) > 0 ? ` — the purse (${fmtPoints(run.purse ?? 0)}) went with it` : ""}. Best this week: ${Math.max(weekBest, run.score).toLocaleString()}.`}
          </p>
          {run.status === "cleared" && (run.purse ?? 0) > 0 && (run.purse_paid ?? 0) === 0 ? (
            <button type="button" onClick={bank} disabled={pending} className="btn-pill px-4 py-2 text-sm disabled:opacity-50">
              Collect the purse — {fmtPoints(run.purse ?? 0)}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setRun(null);
              setLastFight(null);
              setPicks({});
              router.refresh();
            }}
            className="btn-primary px-5 py-2.5 text-sm"
          >
            Draft a new run — {fmtPoints(GAUNTLET_ENTRY_FEE)}
          </button>
        </div>
      ) : atCrossroads && situation ? (
        <div className="card-brand flex flex-col gap-4 border-gold/40 p-6" style={{ boxShadow: "0 0 30px -14px #e8c14b" }}>
          <div>
            <span className="label-dash text-gold">⏸ 20:00 · {situation.title}</span>
            <p className="mt-1 text-sm text-white">{situation.narration}</p>
          </div>
          <MatchTheatre
            key={`half-${run.id}-${run.round}`}
            title="First half"
            tape={{
              events: run.crossroads!.state.events,
              contests: run.crossroads!.state.ledger?.contests ?? [],
              goldSeries: run.crossroads!.state.ledger?.goldSeries ?? [{ clock: 0, diff: 0 }],
              baron: null,
              endClock: 20,
            }}
          />
          <MomentumBar value={run.crossroads!.state.momentum} />
          {theirCall ? (
            <div className="rounded-xl border border-gold/50 bg-gold/5 px-4 py-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
                {run.next_opponent!.ghost!.name} answers
              </span>
              <p className="mt-1 text-sm leading-5 text-white">
                <b>{theirCall.choice.label}</b> — {theirCall.choice.description}
              </p>
              <p className="mt-1 font-mono text-[10.5px] leading-4 text-muted">
                ↳ the call they made at this point in their own run. Knowing it does not make the answer free —
                you still have to be able to afford it.
              </p>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-3">
            {situation.choices.map((choice) => {
              const preview = previewCrossroadsChoice(
                choice, run.lineup, run.next_opponent!.cards, runCtx, run.crossroads!.state.momentum,
                run.crossroads!.state.lanes ?? [],
              );
              const chance = preview
                ? winChanceOf(preview.yourVal, preview.theirVal, crossroadsSpread(runCtx.arena))
                : 1;
              const pays = preview ? daringAt(choice.scoreBonus, chance) : 0;
              const odds = Math.round(chance * 100);
              // THE ORACLE: the second half is sealed — its seed is on the
              // row — so with the relic held, each call's ending is simply
              // read off it. The same pure function the server will run.
              const oracle = runCtx.effects.oracle
                ? simulateSecondHalf(run.crossroads!.state, choice.key, run.lineup, run.next_opponent!.cards, runCtx, mulberry32(run.crossroads!.seed2))
                : null;
              return (
                <button
                  key={choice.key}
                  type="button"
                  onClick={() => choose(choice.key)}
                  disabled={pending}
                  className={`flex flex-col rounded-xl border p-4 text-left transition hover:-translate-y-1 disabled:opacity-50 ${preview ? "border-gold/50 bg-[#171208]" : "border-border-subtle bg-surface/60"}`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="type-display text-lg text-white">{choice.label}</span>
                    <span
                      className="font-mono text-lg font-bold tabular-nums"
                      style={{ color: odds >= 60 ? "#2ee6a8" : odds >= 40 ? "#f5b62e" : "#ff6b35" }}
                    >
                      {preview ? `${odds}%` : "sure"}
                    </span>
                  </span>
                  <span className="mt-1.5 text-xs leading-5 text-[#cfc9d6]">{choice.description}</span>
                  {preview ? (
                    <>
                      <span className="mt-3 font-mono text-[11px] text-white">
                        your {choice.yourKeys.join("+")} <b className="text-mint">{preview.yourVal}</b> vs their{" "}
                        {choice.theirKeys.join("+")} <b className="text-coral">{preview.theirVal}</b>
                      </span>
                      <span className="mt-1 font-mono text-[10px] text-muted">
                        lands <span className="text-mint">+{choice.win}</span> · fails{" "}
                        <span className="text-coral">{choice.lose}</span> momentum
                      </span>
                      <span className="mt-1 font-mono text-[10px] text-gold">
                        pays <b>+{pays}</b> score at {odds}%
                        {pays > choice.scoreBonus ? " — long odds pay more" : pays < choice.scoreBonus ? " — safe odds pay less" : ""}
                      </span>
                    </>
                  ) : (
                    <span className="mt-3 font-mono text-[10px] text-muted">
                      no roll · a sure +{choice.win} momentum · no daring
                    </span>
                  )}
                  <span className="mt-2.5 border-t border-border-subtle/60 pt-2 text-[11px] leading-4 text-muted">
                    ↳ {choice.consequence.note}
                  </span>
                  {oracle ? (
                    <span
                      data-testid="oracle"
                      className={`mt-2 rounded-md border px-2 py-1 font-mono text-[10.5px] ${oracle.won ? "border-mint/60 text-mint" : "border-coral/60 text-coral"}`}
                    >
                      THE ORACLE: this call {oracle.won ? "WINS" : "LOSES"} the game · whistle at {oracle.momentum} momentum
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] leading-4 text-muted">
            <b className="text-white">Daring pays by risk, not by stat.</b> A call you&apos;re favoured to land
            pays a fraction of its listed score; a coin flip pays it in full; a long shot pays up to double. The
            safe play never pays daring at all — so the call you&apos;re best at is the cheap one. The second
            half is already sealed; only the call is yours.
          </p>
        </div>
      ) : offering ? (
        <div className="card-brand flex flex-col gap-4 p-6">
          <div>
            <span className="label-dash text-coral">ROUND {run.round - 1} CLEARED · CHOOSE YOUR RELIC</span>
            {runCtx.effects.rerollOffer && !run.reroll_used ? (
              <button
                type="button"
                onClick={reroll}
                disabled={pending}
                className="ml-3 rounded-full border border-[#a8e6ff]/60 bg-[#a8e6ff]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[#a8e6ff] transition hover:bg-[#a8e6ff]/20 disabled:opacity-50"
              >
                THE REMATCH — deal again
              </button>
            ) : null}
            <p className="mt-1 text-xs text-muted">
              One of three, run-scoped. The other two are burned — choosing is the game. Rares get likelier
              the deeper you go, and the offer leans toward what you are already building — never so far
              that it stops offering you a way out of it.
            </p>
          </div>
          {/* What you are holding, by family. The offer leans toward these,
              and multipliers of a family compound — so a player stacking one
              on purpose should be able to SEE the build rather than
              rediscover it by reading five relic descriptions. */}
          {runHeirloom ? (
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="label-dash mr-1">Brought along</span>
              <span className="rounded-full border border-gold/50 bg-gold/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-gold">
                {runHeirloom.kind === "moment" ? "✦ " : "▦ "}
                {runHeirloom.title}
              </span>
              {runHeirloomBlurb ? (
                <span className="font-mono text-[10.5px] leading-4 text-muted">{runHeirloomBlurb}</span>
              ) : null}
            </div>
          ) : null}
          {heldFamilies.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="label-dash mr-1">Holding</span>
              {heldFamilies.map(([family, count]) => (
                <span
                  key={family}
                  className="rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
                  style={{ borderColor: `${FAMILY_COLOR[family]}80`, color: FAMILY_COLOR[family] }}
                >
                  {family} ×{count}
                </span>
              ))}
            </div>
          ) : null}
          <div
            data-testid="bank-or-push"
            className="flex flex-wrap items-center gap-3 rounded-xl border border-gold/50 bg-gold/5 px-4 py-3"
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Bank or push</span>
            <span className="text-sm text-white">
              Purse <b className="font-mono">{fmtPoints(run.purse ?? 0)}</b>. Round {run.round} pays{" "}
              <b className="font-mono text-mint">+{fmtPoints(purseStep(run.round))}</b> if you win it — and takes the whole
              purse if you don&apos;t.
            </span>
            <button
              type="button"
              onClick={bank}
              disabled={pending}
              className="ml-auto rounded-full border border-gold bg-gold/15 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-gold transition hover:bg-gold/30 disabled:opacity-50"
            >
              Bank {fmtPoints(run.purse ?? 0)} and stop
            </button>
            <span className="basis-full text-[11px] text-muted">
              Pick a relic to push on. A full clear pays {fmtPoints(PURSE_MAX)}; the score is board points either way.
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {(run.relic_offer ?? []).map((key) => {
              const relic = RELIC_BY_KEY.get(key) ?? RELIC_CATALOG[0];
              const color = FAMILY_COLOR[relic.family];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => pick(key)}
                  disabled={pending}
                  className="flex flex-col rounded-xl border bg-[#120f18] p-4 text-left transition hover:-translate-y-1 disabled:opacity-50"
                  style={{ borderColor: `${color}70`, boxShadow: `0 0 22px -10px ${color}` }}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[9px] font-bold uppercase tracking-[0.22em]" style={{ color }}>
                      {relic.family}
                    </span>
                    <span
                      className="text-[9px] font-bold uppercase tracking-[0.18em]"
                      style={{ color: RARITY_COLOR[relic.rarity] }}
                    >
                      {relic.rarity}
                    </span>
                  </span>
                  <span className="type-display mt-1 text-xl text-white">{relic.title}</span>
                  <span className="mt-2 text-xs leading-5 text-[#cfc9d6]">{relic.effect}</span>
                  <span className="mt-3 text-[10px] italic text-muted">“{relic.flavor}”</span>
                </button>
              );
            })}
          </div>
          {canSwap ? (
            <div className="flex flex-wrap items-end gap-2 border-t border-border-subtle/60 pt-3">
              <span className="label-dash">The sixth man</span>
              <select className="input-brand px-2 py-1.5 text-xs" value={swapOut} onChange={(e) => { setSwapOut(e.target.value === "" ? "" : Number(e.target.value)); setSwapIn(""); }}>
                <option value="">Bench…</option>
                {run.lineup.filter((card) => card.inventoryId !== null).map((card) => (
                  <option key={card.inventoryId} value={card.inventoryId!}>{card.role} · {card.name}</option>
                ))}
              </select>
              <select className="input-brand px-2 py-1.5 text-xs" value={swapIn} onChange={(e) => setSwapIn(e.target.value === "" ? "" : Number(e.target.value))} disabled={swapOut === ""}>
                <option value="">…for</option>
                {swapRole
                  ? options[swapRole]
                      .filter((option) => !run.lineup.some((card) => card.inventoryId === option.inventoryId))
                      .map((option) => (
                        <option key={option.inventoryId} value={option.inventoryId}>
                          {option.name} · {option.overall}
                          {option.league === "academy" ? " · ACA" : ""}
                          {option.fresh ? " 🌱" : ""}
                        </option>
                      ))
                  : null}
              </select>
              <button type="button" onClick={benchSwap} disabled={pending || swapOut === "" || swapIn === ""} className="btn-pill px-3 py-1.5 text-xs disabled:opacity-50">
                Swap
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="card-brand flex flex-col gap-4 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="label-dash text-coral">NEXT · ROUND {run.round}</span>
            {run.next_opponent ? (
              <span className="text-sm text-white">⚠ {run.next_opponent.label}</span>
            ) : null}
          </div>
          {run.next_opponent ? <ScoutingReport opponent={run.next_opponent} /> : null}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={fight} disabled={pending} className="btn-primary px-6 py-2.5 text-sm disabled:opacity-50">
              {pending ? "The game is live…" : `FIGHT ROUND ${run.round}`}
            </button>
            <span className="text-xs text-muted">The game pauses at 20:00 for your call — scout them first.</span>
          </div>
        </div>
      )}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </section>
  );
}

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
  chooseGauntletPathAction,
  fightGauntletRoundAction,
  pickGauntletRelicAction,
  resetGauntletRunAction,
  startGauntletRunAction,
} from "@/lib/gauntlet/actions";
import { CROSSROADS_BY_KEY, crossroadsSpread, daringAt, winChanceOf } from "@/lib/gauntlet/crossroads";
import MatchTheatre from "./MatchTheatre";
import { AutopsyPanel, Scoreboard } from "./MatchAutopsy";
import ScoutingReport from "./ScoutingReport";
import {
  GAUNTLET_ENTRY_FEE,
  type GauntletRunRow,
  matchContextFor,
  type StoredMatchResult,
} from "@/lib/gauntlet/run";
import type { GauntletOption } from "@/lib/gauntlet/queries";
import { RELIC_BY_KEY, RELIC_CATALOG, type RelicFamily } from "@/lib/gauntlet/relics";
import {
  compProfileOf,
  type CompStyle,
  FRESH_LEGS_BONUS,
  GAUNTLET_ROLES,
  GAUNTLET_ROUNDS,
  type GauntletCard,
  type GauntletRole,
  LANE_KEY,
  makeTrialist,
  previewCrossroadsChoice,
} from "@/lib/gauntlet/sim";

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
      <div className="h-2.5 overflow-hidden rounded-full border border-line bg-[#3a2030]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#2b6cb0] to-mint transition-all"
          style={{ width: `${value}%` }}
        />
      </div>
      <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-steel">Momentum · {value}%</p>
    </div>
  );
}

function LineupRow({ lineup }: { lineup: GauntletRunRow["lineup"] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {lineup.map((card) => (
        <div
          key={`${card.role}-${card.inventoryId ?? "trialist"}`}
          className={`w-[104px] rounded-lg border px-2.5 py-2 ${card.trialist ? "border-dashed border-line bg-panel/60" : "border-[#3d4a6b] bg-[#141c30]"}`}
        >
          <p className="text-[8px] uppercase tracking-[0.2em] text-steel">{card.role}</p>
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
      style={{ color, borderColor: `${color}80`, background: `${color}14` }}
      title={relic.effect}
    >
      {relic.title}
    </span>
  );
}

/** The draft's identity readout — the SAME three numbers compStyleOf
 *  reads, so "what does my comp read as" is never a guess. */
function CompReadout({ cards }: { cards: GauntletCard[] }) {
  const profile = compProfileOf(cards);
  const style = (Object.keys(profile) as CompStyle[]).reduce((best, key) =>
    profile[key] > profile[best] ? key : best,
  );
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line/60 bg-panel/40 p-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-[10px] uppercase tracking-[0.18em] text-steel">Comp readout</span>
        {(["poke", "dive", "protect"] as CompStyle[]).map((key) => (
          <span key={key} className={`font-mono text-xs ${key === style ? "font-bold text-mint" : "text-steel"}`}>
            {key} {profile[key]}
          </span>
        ))}
      </div>
      <p className="text-xs text-steel">
        Reads as <b className="uppercase text-white">{style}</b> — wins the draft read into{" "}
        <b className="uppercase">{BEATS[style]}</b>, loses it to{" "}
        <b className="uppercase">{BEATS[BEATS[style]]}</b>. The rulebook below has every check this comp will
        roll.
      </p>
    </div>
  );
}

export default function GauntletClient({
  initialRun,
  options,
  balance,
  weekBest,
}: {
  initialRun: GauntletRunRow | null;
  options: Record<GauntletRole, GauntletOption[]>;
  balance: number;
  weekBest: number;
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
  const [swapOut, setSwapOut] = useState<number | "">("");
  const [swapIn, setSwapIn] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
        };
      }),
    [picks, options],
  );
  const draftAvg = useMemo(() => {
    const overalls = draftCards.map((card) => card.overall);
    return Math.round((overalls.reduce((a, b) => a + b, 0) / overalls.length) * 10) / 10;
  }, [draftCards]);

  function start() {
    setError(null);
    startTransition(async () => {
      const result = await startGauntletRunAction(picks);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLastFight(null);
      setRun(result.run);
      // The header's attempts/best strip is server-rendered — let it catch up.
      router.refresh();
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
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Walk away from this run? You get NOTHING back — no refund, no reward. The entry fee stays in the week's pot; the score you've already won stands on the board.",
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
      setRun({ ...run, status: "banked", relic_offer: null, crossroads: null, score: result.score });
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
          <p className="mt-2 max-w-2xl text-sm text-steel">
            One per role, from your shelf. 🌱 marks this week&apos;s prints — they fight at +{FRESH_LEGS_BONUS}. A
            role you can&apos;t cover fields a 55-rated trialist (and taxes your score). The bracket scales to
            your average, so the run is about drafting a shape and making the calls, not raw numbers.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {GAUNTLET_ROLES.map((role, index) => {
            const card = draftCards[index];
            return (
              <label key={role} className="flex flex-col gap-1 text-xs text-steel">
                <span className="label-dash">{role}</span>
                <select
                  className="input-brand px-2 py-2 text-sm"
                  value={picks[role] ?? ""}
                  onChange={(event) =>
                    setPicks((prev) => ({ ...prev, [role]: event.target.value === "" ? null : Number(event.target.value) }))
                  }
                >
                  <option value="">Trialist (55)</option>
                  {options[role].map((option) => (
                    <option key={option.inventoryId} value={option.inventoryId}>
                      {option.name} · {option.overall}
                      {option.fresh ? " 🌱" : ""}
                      {option.foil ? " ✦" : ""}
                      {option.signed ? " ✍" : ""}
                    </option>
                  ))}
                </select>
                <span className="font-mono text-[10px] text-steel">
                  {card.trialist
                    ? "warm body · −40 score/round"
                    : `${LANE_KEY[role]} ${card.stats[LANE_KEY[role]] ?? "~" + Math.max(30, card.overall - 5)} · combat ${card.stats.combat ?? "~" + Math.max(30, card.overall - 5)} · damage ${card.stats.damage ?? "~" + Math.max(30, card.overall - 5)}`}
                </span>
              </label>
            );
          })}
        </div>
        <CompReadout cards={draftCards} />
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" onClick={start} disabled={pending || short} className="btn-coral px-5 py-2.5 text-sm disabled:opacity-50">
            {pending ? "Entering…" : `Enter the Gauntlet — ${fmtPoints(GAUNTLET_ENTRY_FEE)}`}
          </button>
          <span className="text-xs text-steel">
            Lineup average {draftAvg} · bracket starts just under it, ends well over
            {short ? ` · your wallet is short (${fmtPoints(balance)})` : ""}
          </span>
        </div>
        {weekBest > 0 ? (
          <p className="text-xs text-steel">Your best this week: <b className="text-white">{weekBest.toLocaleString()}</b> — a new run can beat it.</p>
        ) : null}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </section>
    );
  }

  const over = run.status !== "active";
  const offering = run.status === "active" && run.relic_offer;
  const atCrossroads = run.status === "active" && run.crossroads && run.next_opponent;
  const canSwap =
    offering && run.relics.includes("sixth_man") && !run.bench_swap_used;
  const swapRole = run.lineup.find((card) => card.inventoryId === Number(swapOut))?.role;
  const situation = atCrossroads ? CROSSROADS_BY_KEY.get(run.crossroads!.state.situationKey) ?? null : null;
  // The same context the server fights under — relics, their traits, the
  // round's condition — so the odds printed on a choice are the odds.
  const runCtx = matchContextFor(run.relics, run.next_opponent);

  return (
    <section ref={stageRef} className="flex scroll-mt-6 flex-col gap-6">
      <div className="card-brand flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-baseline gap-4">
          <span className="label-dash">
            {over
              ? `RUN ${run.status === "banked" ? "ABANDONED" : run.status.toUpperCase()}`
              : `ROUND ${run.round} OF ${GAUNTLET_ROUNDS}`}
          </span>
          <span className="font-mono text-xl font-bold">{run.score.toLocaleString()}</span>
          <span className="text-xs text-steel">run score</span>
          {run.relics.length > 0 ? (
            <span className="ml-auto flex flex-wrap gap-1.5">
              {run.relics.map((key) => (
                <RelicChip key={key} relicKey={key} />
              ))}
            </span>
          ) : null}
        </div>
        <LineupRow lineup={run.lineup} />
        {!over ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-line/40 pt-3">
            <button
              type="button"
              onClick={reset}
              disabled={pending}
              className="rounded-full border border-line bg-panel px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-steel transition hover:border-coral hover:text-coral disabled:opacity-50"
            >
              Walk away — keep nothing
            </button>
            <span className="text-[11px] text-steel">
              Ends the run for no reward — the fee stays in the pot. Score is board points, never dollars;
              the only money the Gauntlet pays is Monday&apos;s pot, to the top of the board.
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
            <p className="text-xs text-steel">
              The scoreboard, the read, and what comes next unlock when the tape ends — or hit Skip.
            </p>
          ) : null}
          {tapeDone ? (
            <div className="flex flex-col gap-4">
              {lastFight.won ? (
                <p className="text-xs text-steel">
                  MVP <b className="text-white">{lastFight.mvp}</b> · +{lastFight.score.toLocaleString()} score
                  {lastFight.daring > 0 ? (
                    <span className="text-gold"> (of which {lastFight.daring} daring — the call landed)</span>
                  ) : null}
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
          <p className="text-sm text-steel">
            {run.status === "cleared"
              ? "Eight rounds, no falls. The board will remember."
              : run.status === "banked"
                ? "Nothing paid, nothing owed — the score you'd already won stands on the board."
                : `The Gauntlet keeps what it takes. Best this week: ${Math.max(weekBest, run.score).toLocaleString()}.`}
          </p>
          <button
            type="button"
            onClick={() => {
              setRun(null);
              setLastFight(null);
              setPicks({});
              router.refresh();
            }}
            className="btn-coral px-5 py-2.5 text-sm"
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
          <div className="grid gap-4 sm:grid-cols-3">
            {situation.choices.map((choice) => {
              const preview = previewCrossroadsChoice(choice, run.lineup, run.next_opponent!.cards, runCtx);
              const chance = preview
                ? winChanceOf(preview.yourVal, preview.theirVal, crossroadsSpread(runCtx.arena))
                : 1;
              const pays = preview ? daringAt(choice.scoreBonus, chance) : 0;
              const odds = Math.round(chance * 100);
              return (
                <button
                  key={choice.key}
                  type="button"
                  onClick={() => choose(choice.key)}
                  disabled={pending}
                  className={`flex flex-col rounded-xl border p-4 text-left transition hover:-translate-y-1 disabled:opacity-50 ${preview ? "border-gold/50 bg-[#171208]" : "border-line bg-panel/60"}`}
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
                      <span className="mt-1 font-mono text-[10px] text-steel">
                        lands <span className="text-mint">+{choice.win}</span> · fails{" "}
                        <span className="text-coral">{choice.lose}</span> momentum
                      </span>
                      <span className="mt-1 font-mono text-[10px] text-gold">
                        pays <b>+{pays}</b> score at {odds}%
                        {pays > choice.scoreBonus ? " — long odds pay more" : pays < choice.scoreBonus ? " — safe odds pay less" : ""}
                      </span>
                    </>
                  ) : (
                    <span className="mt-3 font-mono text-[10px] text-steel">
                      no roll · a sure +{choice.win} momentum · no daring
                    </span>
                  )}
                  <span className="mt-2.5 border-t border-line/60 pt-2 text-[11px] leading-4 text-steel">
                    ↳ {choice.consequence.note}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] leading-4 text-steel">
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
            <p className="mt-1 text-xs text-steel">One of three, run-scoped. The other two are burned — choosing is the game.</p>
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
                  <span className="text-[9px] font-bold uppercase tracking-[0.22em]" style={{ color }}>
                    {relic.family}
                  </span>
                  <span className="type-display mt-1 text-xl text-white">{relic.title}</span>
                  <span className="mt-2 text-xs leading-5 text-[#cfc9d6]">{relic.effect}</span>
                  <span className="mt-3 text-[10px] italic text-steel">“{relic.flavor}”</span>
                </button>
              );
            })}
          </div>
          {canSwap ? (
            <div className="flex flex-wrap items-end gap-2 border-t border-line/60 pt-3">
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
                          {option.name} · {option.overall}{option.fresh ? " 🌱" : ""}
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
            <button type="button" onClick={fight} disabled={pending} className="btn-coral px-6 py-2.5 text-sm disabled:opacity-50">
              {pending ? "The game is live…" : `FIGHT ROUND ${run.round}`}
            </button>
            <span className="text-xs text-steel">The game pauses at 20:00 for your call — scout them first.</span>
          </div>
        </div>
      )}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </section>
  );
}

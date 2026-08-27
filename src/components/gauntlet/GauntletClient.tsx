"use client";

// The Gauntlet, played. One client component owning the whole run loop:
//
//   draft → fight (timeline) → relic pick → fight → … → fallen/banked/cleared
//
// The server owns every outcome — this component renders the run row the
// actions hand back and never computes a fight itself. The timeline it
// shows IS the stored result, so a refresh mid-run redraws the same game.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtPoints } from "@/lib/betting/format";
import {
  benchSwapGauntletAction,
  fightGauntletRoundAction,
  pickGauntletRelicAction,
  retreatGauntletAction,
  startGauntletRunAction,
} from "@/lib/gauntlet/actions";
import { GAUNTLET_ENTRY_FEE, type GauntletRunRow } from "@/lib/gauntlet/run";
import type { GauntletOption } from "@/lib/gauntlet/queries";
import { RELIC_BY_KEY, RELIC_CATALOG, type RelicFamily } from "@/lib/gauntlet/relics";
import {
  FRESH_LEGS_BONUS,
  GAUNTLET_ROLES,
  GAUNTLET_ROUNDS,
  type GauntletRole,
  type MatchEvent,
  type MatchResult,
} from "@/lib/gauntlet/sim";

const FAMILY_COLOR: Record<RelicFamily, string> = {
  ember: "#ff7a3d",
  void: "#9b6dff",
  ice: "#a8e6ff",
  gold: "#e8c14b",
};

const TONE_DOT: Record<MatchEvent["tone"], string> = {
  win: "bg-mint shadow-[0_0_8px_#3fdc7f]",
  loss: "bg-coral shadow-[0_0_8px_#ff5063]",
  neutral: "bg-steel",
};

function clock(minutes: number | null): string {
  if (minutes === null) return "—";
  return `${minutes}:00`;
}

/** The fight, narrated — the stored MatchResult drawn as the mockup's
 *  timeline: tone dots, the numbers in monospace, the call in display. */
function Timeline({ result }: { result: MatchResult & { round?: number } }) {
  return (
    <div className="flex flex-col border-l-2 border-line pl-4">
      {result.events.map((event, index) => (
        <div key={index} className="relative flex flex-wrap items-baseline gap-x-3 py-1.5">
          <span
            aria-hidden
            className={`absolute -left-[21px] top-2.5 h-2.5 w-2.5 rounded-full ${TONE_DOT[event.tone]}`}
          />
          <span className="w-11 shrink-0 font-mono text-[11px] text-steel">{clock(event.clock)}</span>
          <span className={`text-sm ${event.kind === "nexus" ? "type-display text-xl" : ""} ${event.kind === "nexus" ? (event.tone === "win" ? "text-mint" : "text-coral") : ""}`}>
            {event.text}
          </span>
          {event.detail ? <span className="font-mono text-[10px] text-steel">{event.detail}</span> : null}
        </div>
      ))}
    </div>
  );
}

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
  const [lastFight, setLastFight] = useState<(MatchResult & { round: number }) | null>(
    initialRun?.last_result ?? null,
  );
  const [picks, setPicks] = useState<Partial<Record<GauntletRole, number | null>>>({});
  const [swapOut, setSwapOut] = useState<number | "">("");
  const [swapIn, setSwapIn] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const draftAvg = useMemo(() => {
    const overalls = GAUNTLET_ROLES.map((role) => {
      const id = picks[role];
      const option = typeof id === "number" ? options[role].find((o) => o.inventoryId === id) : null;
      return option ? option.overall : 55;
    });
    return Math.round((overalls.reduce((a, b) => a + b, 0) / overalls.length) * 10) / 10;
  }, [picks, options]);

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
      setLastFight(result.run.last_result ?? { ...result.result, round: run.round });
      setRun(result.run);
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

  function retreat() {
    if (!run) return;
    setError(null);
    startTransition(async () => {
      const result = await retreatGauntletAction(run.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRun({ ...run, status: "banked", relic_offer: null });
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
            your average, so the run is about drafting and relic calls, not raw numbers.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {GAUNTLET_ROLES.map((role) => (
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
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" onClick={start} disabled={pending || short} className="btn-coral px-5 py-2.5 text-sm disabled:opacity-50">
            {pending ? "Entering…" : `Enter the Gauntlet — ${fmtPoints(GAUNTLET_ENTRY_FEE)}`}
          </button>
          <span className="text-xs text-steel">
            Lineup average {draftAvg} · bracket starts just under it, ends just over
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
  const canSwap =
    offering && run.relics.includes("sixth_man") && !run.bench_swap_used;
  const swapRole = run.lineup.find((card) => card.inventoryId === Number(swapOut))?.role;

  return (
    <section className="flex flex-col gap-6">
      <div className="card-brand flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-baseline gap-4">
          <span className="label-dash">
            {over ? `RUN ${run.status.toUpperCase()}` : `ROUND ${run.round} OF ${GAUNTLET_ROUNDS}`}
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
      </div>

      {lastFight ? (
        <div className="card-brand flex flex-col gap-4 p-6">
          <span className="label-dash">Round {lastFight.round} — the tape</span>
          <MomentumBar value={lastFight.momentum} />
          <Timeline result={lastFight} />
          {lastFight.won ? (
            <p className="text-xs text-steel">
              MVP <b className="text-white">{lastFight.mvp}</b> · +{lastFight.score.toLocaleString()} score
            </p>
          ) : null}
        </div>
      ) : null}

      {over ? (
        <div className="card-brand flex flex-col items-start gap-3 p-6">
          <span className="label-dash">
            {run.status === "cleared" ? "🏆 FULL CLEAR" : run.status === "banked" ? "Score banked" : "The run ends here"}
          </span>
          <p className="text-sm text-steel">
            {run.status === "cleared"
              ? "Eight rounds, no falls. The board will remember."
              : run.status === "banked"
                ? "A living score beats a dead legend. Sometimes."
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
          <div className="flex items-center gap-3 border-t border-line/60 pt-3">
            <button type="button" onClick={retreat} disabled={pending} className="rounded-full border border-line bg-panel px-4 py-2 text-xs font-semibold uppercase tracking-wide text-steel transition hover:border-gold hover:text-gold disabled:opacity-50">
              Retreat — bank {run.score.toLocaleString()}
            </button>
            <span className="text-xs text-steel">Retreating ends the run; the score stands on the board.</span>
          </div>
        </div>
      ) : (
        <div className="card-brand flex flex-col gap-4 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="label-dash text-coral">NEXT · ROUND {run.round}</span>
            {run.next_opponent ? (
              <span className="text-sm text-white">⚠ {run.next_opponent.label}</span>
            ) : null}
          </div>
          {run.next_opponent ? (
            <div className="flex flex-wrap gap-2">
              {run.next_opponent.cards.map((card) => (
                <div key={card.name} className="w-[104px] rounded-lg border border-[#6b3d47] bg-[#221016] px-2.5 py-2">
                  <p className="text-[8px] uppercase tracking-[0.2em] text-steel">{card.role}</p>
                  <p className="truncate text-[12px] font-bold text-white">{card.name}</p>
                  <p className="font-mono text-sm font-extrabold text-[#ff8896]">{card.overall}</p>
                </div>
              ))}
            </div>
          ) : null}
          <div>
            <button type="button" onClick={fight} disabled={pending} className="btn-coral px-6 py-2.5 text-sm disabled:opacity-50">
              {pending ? "The game is live…" : `FIGHT ROUND ${run.round}`}
            </button>
          </div>
        </div>
      )}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </section>
  );
}

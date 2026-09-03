"use client";

// The felt. Draws the public state everyone shares and the two cards only
// the viewer holds; listens to the table's rows for changes and asks the
// server for a fresh view when they move, and again when the clock runs
// out so a timed-out seat gets folded by whoever is watching.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { fmtPoints } from "@/lib/betting/format";
import { useAutoDisarm } from "@/lib/ui/useAutoDisarm";
import { showdownActAction, sitDownAction, standUpAction, syncShowdownTableAction, type ShowdownResult } from "@/lib/showdown/actions";
import { SEATS_MAX } from "@/lib/showdown/config";
import type { PublicSeat } from "@/lib/showdown/engine";
import { evaluateBest, straightOf } from "@/lib/showdown/hands";
import type { StackOption, TableView } from "@/lib/showdown/server";
import { createClient } from "@/lib/supabase/client";
import MiniCard from "./MiniCard";
import StackBuilder from "./StackBuilder";

const STREET_LABEL: Record<string, string> = { preflop: "Preflop", flop: "Flop", turn: "Turn", river: "River", showdown: "Showdown" };

export default function ShowdownTable({ initial, options }: { initial: TableView; options: StackOption[] }) {
  const [view, setView] = useState<TableView>(initial);
  const [error, setError] = useState<string | null>(null);
  const [choosingSeat, setChoosingSeat] = useState<number | null>(null);
  const [standArmed, setStandArmed] = useState(false);
  useAutoDisarm(standArmed, () => setStandArmed(false));
  const [raiseInput, setRaiseInput] = useState<number | null>(null);
  const [pending, start] = useTransition();
  /** The clock, sampled by the tick below: local time plus the offset to
   *  the server's, measured whenever a view arrives. Null until the first
   *  tick so nothing here reads Date.now() during render. */
  const [clock, setClock] = useState<{ now: number; skew: number } | null>(null);
  const skew = useRef(0);
  const syncing = useRef(false);

  const tableId = view.table.id;
  const hand = view.state.hand;
  const mySeat = view.mySeat;
  const me = mySeat !== null ? view.state.seats.find((seat) => seat.seatNo === mySeat) ?? null : null;
  const myTurn = hand !== null && mySeat !== null && hand.toAct === mySeat;

  const refresh = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      const result = await syncShowdownTableAction({ tableId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      skew.current = new Date(result.value.serverNow).getTime() - Date.now();
      setView(result.value);
    } finally {
      syncing.current = false;
    }
  }, [tableId]);

  // The table's rows are the signal; the fresh view comes from the server
  // so hole cards never travel over the channel.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`showdown-${tableId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "showdown_tables", filter: `id=eq.${tableId}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "showdown_seats", filter: `table_id=eq.${tableId}` }, () => void refresh())
      .subscribe();
    const safety = setInterval(() => void refresh(), 15000);
    return () => {
      clearInterval(safety);
      void supabase.removeChannel(channel);
    };
  }, [tableId, refresh]);

  // The clock, on the server's time. The tick samples it, and once the
  // deadline is a second gone it asks the server to act on it — whoever is
  // watching folds the seat that ran out, not only the seat itself.
  const deadline = hand?.deadlineAt ? new Date(hand.deadlineAt).getTime() : null;
  const deadlineRef = useRef<number | null>(null);
  useEffect(() => {
    deadlineRef.current = deadline;
  }, [deadline]);
  useEffect(() => {
    skew.current = new Date(initial.serverNow).getTime() - Date.now();
    const tick = setInterval(() => {
      const now = Date.now();
      setClock({ now, skew: skew.current });
      const due = deadlineRef.current;
      if (due !== null && now + skew.current > due + 1000) void refresh();
    }, 500);
    return () => clearInterval(tick);
  }, [initial.serverNow, refresh]);
  const serverNow = clock ? clock.now + clock.skew : null;
  const secondsLeft = deadline !== null && serverNow !== null ? Math.max(0, Math.ceil((deadline - serverNow) / 1000)) : null;

  const run = (work: () => Promise<ShowdownResult<TableView>>) => {
    setError(null);
    start(async () => {
      const result = await work();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setView(result.value);
    });
  };

  const actOn = (action: { type: "fold" | "check" | "call" } | { type: "bet" | "raise"; to: number }) =>
    run(() => showdownActAction({ tableId, action }));

  const owed = hand && me ? hand.currentBet - me.bet : 0;
  const minTo = hand && me ? (hand.currentBet === 0 ? view.bracket.bigBlind : hand.currentBet + hand.minRaise) : 0;
  const maxTo = me ? me.bet + me.chips : 0;
  // The raise box shows what was typed, held inside what is legal; with
  // nothing typed it shows the minimum.
  const raiseTo = Math.min(maxTo, Math.max(Math.min(minTo, maxTo), raiseInput ?? minTo));

  const seats = useMemo(() => Array.from({ length: SEATS_MAX }, (_, seatNo) => view.state.seats.find((seat) => seat.seatNo === seatNo) ?? null), [view.state.seats]);
  const last = view.state.lastHand;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-steel">
        <Link href="/cards/showdown" className="label-dash hover:text-coral">← Tables</Link>
        <span>
          {view.bracket.label} · blinds {fmtPoints(view.bracket.smallBlind)} / {fmtPoints(view.bracket.bigBlind)} · cap {view.bracket.stackCap}
          {view.bracket.free ? " · play chips, nothing won or lost" : ""}
          {view.table.code ? " · unlisted" : ""}
        </span>
      </div>

      <section
        aria-label="The table"
        className="relative flex flex-col gap-5 rounded-[3rem] border-8 border-[#071b16] bg-[radial-gradient(ellipse_at_50%_40%,#1a5a44,#0f3d2e_60%,#071b16)] p-5 sm:p-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="type-display text-lg text-white">{view.table.name}</span>
          <span className="text-xs text-[#e9f5ee]">
            {hand ? `Hand ${hand.handNo} · ${STREET_LABEL[hand.street]} · pot ${fmtPoints(hand.pot)}` : view.state.seats.length < 2 ? "Waiting for a second player" : "Between hands"}
          </span>
        </div>

        {/* The board. During a hand only this hand's cards show, dealt street by
            street; between hands the last board stays up, dimmed, so the
            showdown can be read. Never the last hand's board under a new deal. */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] uppercase tracking-[0.16em] text-[#e9f5ee]/60">
            {hand ? `Board · ${STREET_LABEL[hand.street]}` : last ? "Last board" : "Board"}
          </span>
          <div className="flex items-start justify-center gap-1.5 sm:gap-3">
            {Array.from({ length: 5 }, (_, i) => {
              const shown = hand ? hand.board[i] ?? null : last?.board[i] ?? null;
              return (
                <MiniCard
                  key={i}
                  card={shown}
                  size="board"
                  dim={!hand && Boolean(last)}
                  label={i < 3 ? (i === 0 ? "Flop" : undefined) : i === 3 ? "Turn" : "River"}
                />
              );
            })}
          </div>
        </div>

        {me && me.inHand && !me.folded && view.myHole.length > 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-xl border border-mint/40 bg-[#071b16]/70 p-3">
            <span className="text-[10px] uppercase tracking-[0.16em] text-mint">Your hand</span>
            <div className="flex items-start gap-2 sm:gap-3">
              {view.myHole.map((card) => (
                <MiniCard key={card.id} card={card} size="hole" />
              ))}
            </div>
            <span className="text-xs text-[#e9f5ee]">{describeHolding(view.myHole, hand?.board ?? [])}</span>
          </div>
        ) : null}

        {myTurn && me && hand ? (
          <section aria-label="Your move" className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-coral/60 bg-[#071b16]/80 p-3 sm:gap-3">
            <span className="w-full text-center text-xs text-[#e9f5ee] sm:w-auto">
              <span className="font-semibold text-coral">Your move</span>
              {secondsLeft !== null ? ` · ${secondsLeft}s` : ""} · {owed > 0 ? `${fmtPoints(owed)} to call` : "nothing to call"}
            </span>
            <button type="button" disabled={pending} onClick={() => actOn({ type: "fold" })} className="btn-pill px-3 py-1 text-xs">Fold</button>
            {owed > 0 ? (
              <button type="button" disabled={pending} onClick={() => actOn({ type: "call" })} className="btn-pill px-3 py-1 text-xs">
                Call {fmtPoints(Math.min(owed, me.chips))}
              </button>
            ) : (
              <button type="button" disabled={pending} onClick={() => actOn({ type: "check" })} className="btn-pill px-3 py-1 text-xs">Check</button>
            )}
            {maxTo > hand.currentBet ? (
              <span className="flex items-center gap-2">
                <input
                  type="number"
                  aria-label={hand.currentBet === 0 ? "Bet to" : "Raise to"}
                  min={Math.min(minTo, maxTo)}
                  max={maxTo}
                  step={view.bracket.bigBlind}
                  value={raiseTo}
                  onChange={(event) => setRaiseInput(Number(event.target.value))}
                  className="w-28 rounded-md border border-line bg-black/20 px-2 py-1 text-xs text-white"
                />
                <button
                  type="button"
                  disabled={pending || raiseTo <= hand.currentBet || raiseTo > maxTo}
                  onClick={() => actOn({ type: hand.currentBet === 0 ? "bet" : "raise", to: raiseTo })}
                  className="btn-pill px-3 py-1 text-xs disabled:opacity-50"
                >
                  {hand.currentBet === 0 ? "Bet" : "Raise to"} {fmtPoints(raiseTo)}
                </button>
                <button type="button" disabled={pending} onClick={() => actOn({ type: hand.currentBet === 0 ? "bet" : "raise", to: maxTo })} className="text-xs text-coral underline-offset-4 hover:underline">
                  All in
                </button>
              </span>
            ) : null}
          </section>
        ) : null}

        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
          {seats.map((seat, seatNo) => (
            <li key={seatNo}>
              <SeatCard
                seat={seat}
                seatNo={seatNo}
                isDealer={view.state.dealerSeat === seatNo && hand !== null}
                isMe={seatNo === mySeat}
                toAct={hand?.toAct === seatNo}
                secondsLeft={hand?.toAct === seatNo ? secondsLeft : null}
                myHole={seatNo === mySeat ? view.myHole : []}
                inHand={hand !== null}
                canSit={view.viewer !== null && mySeat === null && seat === null && view.table.status !== "closed"}
                onSit={() => setChoosingSeat(seatNo)}
              />
            </li>
          ))}
        </ul>
      </section>

      {error ? <p className="text-sm text-coral">{error}</p> : null}

      {choosingSeat !== null && view.viewer ? (
        <StackBuilder
          options={options}
          bracket={view.bracket}
          balance={view.viewer.balance}
          seatNo={choosingSeat}
          pending={pending}
          onCancel={() => setChoosingSeat(null)}
          onSit={(input) => {
            run(async () => {
              const result = await sitDownAction({ tableId, ...input });
              if (result.ok) setChoosingSeat(null);
              return result;
            });
          }}
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-steel">
        {me ? (
          <button
            type="button"
            disabled={pending || me.status === "leaving"}
            onClick={() => {
              // Two taps, like every other money button: standing up mid-hand
              // folds the hand you are in, and on a real table the chips go
              // back to the wallet — not something to do by a slipped click.
              if (!standArmed) {
                setStandArmed(true);
                return;
              }
              setStandArmed(false);
              run(async () => {
                const result = await standUpAction({ tableId });
                return result.ok ? { ok: true, value: result.value.view } : result;
              });
            }}
            className={`underline-offset-4 hover:underline disabled:opacity-50 ${standArmed ? "font-semibold text-coral" : "text-coral"}`}
          >
            {me.status === "leaving"
              ? "Leaving after this hand…"
              : standArmed
                ? view.table.status === "hand" && me.status !== "sitting_out"
                  ? "Confirm — fold this hand and stand up?"
                  : "Confirm — stand up?"
                : (me.status === "sitting_out" && view.table.status === "hand") || view.bracket.free
                  ? "Stand up"
                  : "Stand up and take your chips"}
          </button>
        ) : view.viewer ? (
          <span>Pick an empty seat to sit down.</span>
        ) : (
          <span>Sign in with Discord to sit down. Anyone can watch.</span>
        )}
        {last ? (
          <span>
            Last hand: {last.pots.map((pot) => `${pot.winners.map((seatNo) => `seat ${seatNo + 1}`).join(" & ")} took ${fmtPoints(pot.amount)}${pot.rank ? ` with ${pot.rank}` : ""}`).join("; ")}
            {last.rake > 0 ? ` · ${fmtPoints(last.rake)} raked` : ""}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function SeatCard({
  seat,
  seatNo,
  isDealer,
  isMe,
  toAct,
  secondsLeft,
  myHole,
  inHand,
  canSit,
  onSit,
}: {
  seat: PublicSeat | null;
  seatNo: number;
  isDealer: boolean;
  isMe: boolean;
  toAct: boolean;
  secondsLeft: number | null;
  myHole: TableView["myHole"];
  inHand: boolean;
  canSit: boolean;
  onSit: () => void;
}) {
  if (!seat) {
    return (
      <div className="flex h-full min-h-[3.5rem] items-center justify-center rounded-xl border border-dashed border-[#e9f5ee]/30 text-xs text-[#e9f5ee]/70 sm:min-h-[6rem]">
        {canSit ? (
          <button type="button" onClick={onSit} className="btn-pill px-3 py-1 text-xs">
            Sit here
          </button>
        ) : (
          `Seat ${seatNo + 1}`
        )}
      </div>
    );
  }
  // My own cards live in the "Your hand" panel; the seat shows backs until
  // showdown, when whatever was turned over shows for everyone.
  const showing = seat.shown ?? null;
  void myHole;
  return (
    <div
      className={`flex min-h-[3.5rem] flex-col gap-2 rounded-xl border bg-[#071b16]/70 p-2 sm:min-h-[6rem] sm:p-3 ${
        toAct ? "border-coral shadow-[0_0_0_2px_rgb(255_107_53_/_0.5)]" : "border-[#e9f5ee]/20"
      } ${seat.folded || seat.status !== "active" ? "opacity-70" : ""}`}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-semibold text-white">
          {isDealer ? <span className="mr-1 rounded-full bg-gold px-1.5 text-[10px] font-black text-navy">D</span> : null}
          {seat.username}
          {isMe ? <span className="ml-1 text-[10px] text-mint">you</span> : null}
        </span>
        <span className="type-display text-sm text-white">{fmtPoints(seat.chips)}</span>
      </div>
      <div className="flex items-center gap-1">
        {seat.inHand && !seat.folded ? (
          showing && showing.length > 0 ? (
            showing.map((card) => <MiniCard key={card.id} card={card} size="seat" />)
          ) : isMe ? (
            <span className="text-[11px] text-mint">your cards are above</span>
          ) : (
            <>
              <MiniCard faceDown size="seat" />
              <MiniCard faceDown size="seat" />
            </>
          )
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#e9f5ee]/80">
        {seat.bet > 0 ? <span>in {fmtPoints(seat.bet)}</span> : null}
        {seat.folded ? <span>folded</span> : null}
        {seat.allIn ? <span className="font-semibold text-gold">all in</span> : null}
        {!inHand || !seat.inHand ? (
          <span>{seat.status === "sitting_out" ? "sitting out" : seat.status === "leaving" ? "leaving" : inHand ? "next hand" : ""}</span>
        ) : null}
        {toAct ? <span className="font-semibold text-coral">{secondsLeft !== null ? `to act · ${secondsLeft}s` : "to act"}</span> : null}
      </div>
    </div>
  );
}

/** "Pair of Gamblers · Doug 88 high" — what the two cards make with the
 *  board so far, in the words of the rulebook. */
function describeHolding(hole: TableView["myHole"], board: TableView["myHole"]): string {
  const cards = [...hole, ...board];
  if (cards.length < 5) {
    const teams = new Set(hole.map((card) => card.team));
    const roles = new Set(hole.map((card) => card.role));
    const pair = teams.size === 1 ? `a pair of ${hole[0].team}` : `two teams`;
    const shape = cards.length === 2 ? `${pair}, ${roles.size === 1 ? "same role" : "two roles"}` : `${pair} so far`;
    return `Preflop: ${shape}. The flop makes it a hand.`;
  }
  const best = evaluateBest(cards);
  const straight = best.rank.key === "straight" ? straightOf(best.cards) : null;
  const label = straight ?? best.rank.label;
  const detail = best.detail && best.rank.key !== "straight" && best.rank.key !== "high" ? ` of ${best.detail}` : "";
  const top = best.cards[0];
  return `You have ${label}${detail} · ${top.name ?? top.team} ${top.overall} high`;
}

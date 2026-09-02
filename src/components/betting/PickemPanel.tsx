"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useIsLocked } from "@/hooks/useIsLocked";
import { placePickemCard } from "@/lib/betting/actions";
import { fmtPoints } from "@/lib/betting/format";
import type { PickemData, PickemLegData } from "@/lib/betting/types";
import { StatusPill } from "./StatusPill";
import { LockCountdown } from "./LockCountdown";
import { TeamSideButton } from "./TeamSideButton";

/** One leg's two-team pick row — ported from
 * c:\fpl_gambling\web\src\components\PickemPanel.tsx's LegRow. */
function LegRow({
  leg,
  pick,
  locked,
  onPick,
}: {
  leg: PickemLegData;
  pick: number | undefined;
  locked: boolean;
  onPick: (teamId: number) => void;
}) {
  const resolved = leg.status === "RESOLVED";
  const voided = leg.status === "CANCELLED";
  return (
    <div className="rounded-lg border border-border bg-surface p-3" data-testid={`pickem-leg-${leg.market_id}`}>
      <div className="truncate text-xs uppercase tracking-wide text-muted">{leg.title}</div>
      <div className="mt-2 flex gap-2">
        {[leg.team_a, leg.team_b].map((t) => {
          const chosen = pick === t.id;
          const won = resolved && leg.winning_team_id === t.id;
          return (
            <TeamSideButton
              key={t.id}
              team={t}
              selected={chosen}
              disabled={locked}
              onClick={() => onPick(t.id)}
              className={won ? "ring-2 ring-mint" : undefined}
            >
              {t.short_code}
              {won && " ✓"}
            </TeamSideButton>
          );
        })}
      </div>
      {voided && <div className="mt-1 text-[11px] text-muted">voided</div>}
    </div>
  );
}

/** The open pick'em card, rendered above markets on the betting index page.
 * Ported from c:\fpl_gambling\web\src\components\PickemPanel.tsx (fetch/
 * postJson swapped for the fetchOpenPickem query + placePickemCard action). */
export function PickemPanel({ pickem, balance, loggedIn }: { pickem: PickemData; balance: number; loggedIn: boolean }) {
  const router = useRouter();
  const locked = useIsLocked(pickem.status, pickem.lock_at);

  // Resync local picks/amount when the server hands us a new card (e.g.
  // after router.refresh() following a successful submit) — compare-and-
  // adjust during render, same "prevKey" pattern as useMarketDetail.ts.
  const [prevCard, setPrevCard] = useState(pickem.my_card);
  const [picks, setPicks] = useState<Record<number, number>>(() => pickem.my_card?.picks ?? {});
  const [amount, setAmount] = useState<number>(pickem.my_card?.amount ?? 0);
  if (pickem.my_card !== prevCard) {
    setPrevCard(pickem.my_card);
    setPicks(pickem.my_card?.picks ?? {});
    // `a || ...` only refills amount when it's currently falsy — deliberate,
    // so a resync doesn't clobber an in-progress edit to the stake. Edge
    // case accepted: if the user has cleared the field to 0 right as a
    // resync fires, it repopulates from the server's card amount instead of
    // staying at 0.
    setAmount((a) => a || pickem.my_card?.amount || 0);
  }

  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const complete = pickem.legs.every((l) => picks[l.market_id] !== undefined);
  const liveLegs = pickem.legs.filter((l) => l.status !== "CANCELLED");
  const correctSoFar = pickem.my_card
    ? liveLegs.filter((l) => l.status === "RESOLVED" && pickem.my_card!.picks[l.market_id] === l.winning_team_id).length
    : 0;

  function submit() {
    setError(null);
    setMsg(null);
    startTransition(async () => {
      const result = await placePickemCard(pickem.id, picks, amount);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMsg(pickem.my_card ? "Card updated!" : "Card placed — good luck!");
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4" data-testid="pickem-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-display text-lg not-italic text-white">🃏 {pickem.title}</div>
          <div className="mt-1 text-sm text-muted">
            Pool <b className="font-semibold text-white">{fmtPoints(pickem.pool)}</b> · {pickem.cards} card
            {pickem.cards !== 1 ? "s" : ""}
            {pickem.carryover > 0 && <span className="ml-2 text-gold">💰 {fmtPoints(pickem.carryover)} jackpot!</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={pickem.status} />
          <LockCountdown lockAt={pickem.lock_at} status={pickem.status} />
        </div>
      </div>
      <p className="mt-2 text-sm text-muted">
        Call the winner of every series. Perfect cards split the whole pool — if nobody&apos;s perfect, it rolls over
        to the next night.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {pickem.legs.map((leg) => (
          <LegRow
            key={leg.market_id}
            leg={leg}
            pick={picks[leg.market_id]}
            locked={locked}
            onPick={(teamId) => setPicks((p) => ({ ...p, [leg.market_id]: teamId }))}
          />
        ))}
      </div>

      {pickem.my_card && (
        <div className="mt-4 rounded border border-border px-3 py-2 text-sm" data-testid="pickem-mycard">
          {pickem.status === "RESOLVED" ? (
            (pickem.my_card.payout ?? 0) > 0 ? (
              <span className="text-mint">Perfect card! +{fmtPoints(pickem.my_card.payout!)} 🏆</span>
            ) : (
              <span className="text-muted">
                Your card: {pickem.my_card.correct}/{liveLegs.length} — better luck next night
              </span>
            )
          ) : (
            <span className="text-muted">
              Your card: {fmtPoints(pickem.my_card.amount)}
              {locked && ` · ${correctSoFar}/${liveLegs.length} so far`}
            </span>
          )}
        </div>
      )}

      {!locked &&
        (loggedIn ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              aria-label="card amount"
              className="w-28 input-brand p-2"
              type="number"
              min={1}
              max={balance}
              placeholder="stake"
              value={amount || ""}
              onChange={(e) => setAmount(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
            />
            <button
              type="button"
              className="rounded bg-primary px-4 py-2 text-sm font-bold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!complete || amount <= 0 || amount > balance || pending}
              onClick={submit}
            >
              {pickem.my_card ? "Update card" : "Lock it in"}
            </button>
          </div>
        ) : (
          <div className="mt-3 text-xs text-muted">Log in to play the Pick&apos;em.</div>
        ))}
      {msg && <div className="mt-2 text-xs text-mint">{msg}</div>}
      {error && <div className="mt-2 text-xs text-red-400">{error}</div>}
    </div>
  );
}

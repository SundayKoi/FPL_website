"use client";

// The pack counter: a till, and nothing more.
//
// Buying and rolling both happen server-side the moment the button is
// clicked, so the pack's contents are settled before anything appears on
// screen. Everything after that — the drop, the rip, the flip line, the
// walkouts, the summary — belongs to PackOpening, which takes the whole
// screen for the length of the ritual. This component's remaining job is the
// wallet, the price, the sound toggle, and knowing when to hand over.
//
// "Open another" is deliberately *not* a button down here: once the overlay
// is up it stays up, and it re-invokes the action through `openAnother`
// below. The balance and the opened-pack count are kept in this component so
// they're still right when the overlay comes down, whether it opened one pack
// or nine.

import { useCallback, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtPoints } from "@/lib/betting/format";
import type { CardLeague } from "@/lib/cards/queries";
import { openDailyRipAction, openPackAction, setPatronFlameAction } from "@/lib/packs/actions";
import { PATRON_FLAMES, PATRON_FLAME_KEYS, patronFlameOf, type PatronFlameKey } from "@/lib/patron/flames";
import { getMuted, getMutedServer, setMuted, subscribeMuted } from "@/lib/packs/sounds";
import PackOpening, { type OpenResult, type Pull } from "./PackOpening";

/** "Week 3 · Sep 8" — the week number counts up from the season's first
 *  archived edition, which is how players talk about them. */
function editionLabel(week: string, number: number): string {
  const date = new Date(`${week}T12:00:00.000Z`);
  const when = date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `Week ${number} · ${when}`;
}

export default function PackShop({
  league,
  balance: initialBalance,
  packCost,
  openCount: initialOpenCount,
  ownedSlugs = [],
  editionWeeks = [],
  dailyRipsLeft = 0,
  patron = false,
  flame = null,
}: {
  league: CardLeague;
  balance: number;
  packCost: number;
  openCount: number;
  /** Every archived edition week, newest first. A pack can be bought for
   *  any of them, so no week's cards ever stop being obtainable. Empty on a
   *  league whose first weekly drop hasn't run — the shop then just sells
   *  the current cards. */
  editionWeeks?: string[];
  /** Every slug already in the collection — the overlay's NEW badges are the
   *  difference between this and what comes out of the pack. */
  ownedSlugs?: string[];
  /** Free daily rips still unclaimed today (Eastern). Server-computed at
   *  render; the button also survives a stale value because the RPC is the
   *  real gate — a raced claim just shows its error. */
  dailyRipsLeft?: number;
  /** Active League Patron — labels the second rip for what it is. */
  patron?: boolean;
  /** The patron's flame, for the reveal stage and the wardrobe picker. */
  flame?: string | null;
}) {
  const router = useRouter();
  const [balance, setBalance] = useState(initialBalance);
  const [openCount, setOpenCount] = useState(initialOpenCount);
  const [pulls, setPulls] = useState<Pull[] | null>(null);
  const [ripsLeft, setRipsLeft] = useState(dailyRipsLeft);
  const [ripStreak, setRipStreak] = useState<number | null>(null);
  // Optimistic: the swatch recolours instantly and the server action
  // confirms behind it — a paint chip is the one thing safe to trust ahead.
  const [flameKey, setFlameKey] = useState<PatronFlameKey | null>(flame ? patronFlameOf(flame) : null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Defaults to the newest week; picking an older one re-mints that week
  // exactly, ratings and all.
  const [week, setWeek] = useState(editionWeeks[0] ?? "");

  // Mute belongs to the audio module, not to this component: the rip, the
  // flips and the walkout stings are all the same setting, and it's persisted
  // across sessions. Reading it as an external store keeps the server render
  // (always unmuted) honest.
  const muted = useSyncExternalStore(subscribeMuted, getMuted, getMutedServer);

  const base = league === "academy" ? "/academy/cards" : "/cards";

  /** The wallet and the counter after a successful open. Shared by the first
   *  pack and by every "Open another" inside the overlay. */
  const banked = useCallback(
    (nextBalance: number) => {
      setBalance(nextBalance);
      setOpenCount((n) => n + 1);
      // The collection below is server-rendered, so it only learns about
      // these cards on a refresh. The overlay is local state and survives it
      // — the opening keeps playing while the grid catches up.
      router.refresh();
    },
    [router],
  );

  function handleOpen() {
    setError(null);
    startTransition(async () => {
      const result = await openPackAction(league, week || undefined);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPulls(result.cards);
      banked(result.balance);
    });
  }

  function handleDailyRip() {
    setError(null);
    startTransition(async () => {
      const result = await openDailyRipAction(league);
      if (!result.ok) {
        setError(result.error);
        // The server refused, so trust its count over ours — a rip claimed
        // in another tab or over Discord already spent today's.
        if (/already ripped/i.test(result.error)) setRipsLeft(0);
        return;
      }
      setRipsLeft((n) => Math.max(0, n - 1));
      setRipStreak(result.streak ?? null);
      setPulls(result.cards);
      banked(result.balance);
    });
  }

  // Handed to the overlay rather than letting it call the action itself: the
  // shop owns the wallet, so it has to see every purchase. A failed open is
  // returned intact for the summary bar to show — the stage stays up.
  // `week` is a dependency for real: without it, "Open another" would keep
  // minting whichever edition was selected when the overlay first mounted.
  const openAnother = useCallback(async (): Promise<OpenResult> => {
    const result = await openPackAction(league, week || undefined);
    if (result.ok) banked(result.balance);
    return result;
  }, [league, week, banked]);

  const handleExit = useCallback(() => {
    setPulls(null);
    router.refresh();
  }, [router]);

  return (
    <section className="flex flex-col gap-6">
      <div className="card-brand flex flex-wrap items-center gap-4 p-5">
        <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-sm font-semibold text-gold">
          {fmtPoints(balance)}
        </span>
        <div className="flex flex-col">
          <span className="label-dash">Pack price</span>
          <span className="text-sm font-semibold text-white">{fmtPoints(packCost)}</span>
        </div>
        {editionWeeks.length > 0 ? (
          <label className="flex flex-col gap-1 text-xs text-steel">
            Edition
            <select
              value={week}
              onChange={(event) => setWeek(event.target.value)}
              disabled={pending}
              className="input-brand px-3 py-2 text-sm disabled:opacity-60"
            >
              {editionWeeks.map((value, index) => (
                <option key={value} value={value}>
                  {editionLabel(value, editionWeeks.length - index)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="button"
          onClick={handleOpen}
          disabled={pending}
          className="btn-coral px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Opening…" : `Open pack — ${fmtPoints(packCost)}`}
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDailyRip}
            disabled={pending || ripsLeft <= 0}
            title={patron ? "Patrons rip twice a day" : "One free pack per day"}
            className="rounded-full border border-gold/60 bg-gold/10 px-5 py-2.5 text-sm font-semibold text-gold transition hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ripsLeft > 0
              ? `Daily Rip — free${patron && ripsLeft > 1 ? ` (${ripsLeft} left)` : ""}`
              : "Ripped today ✓"}
          </button>
          {ripStreak && ripStreak > 1 ? (
            <span className="text-xs font-semibold text-gold">🔥 {ripStreak}-day streak</span>
          ) : null}
        </div>
        {patron ? (
          <div className="flex w-full flex-wrap items-center gap-2 border-t border-line/50 pt-3">
            <span className="label-dash">Your flame</span>
            {PATRON_FLAME_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={flameKey === key}
                title={PATRON_FLAMES[key].label}
                onClick={() => {
                  setFlameKey(key);
                  void setPatronFlameAction(key);
                }}
                className={`h-7 w-7 rounded-full border-2 transition ${
                  flameKey === key ? "scale-110 border-white" : "border-transparent opacity-70 hover:opacity-100"
                }`}
                style={{ background: `radial-gradient(circle, ${PATRON_FLAMES[key].hot} 0 35%, ${PATRON_FLAMES[key].core} 75%)` }}
              >
                <span className="sr-only">{PATRON_FLAMES[key].label} flame</span>
              </button>
            ))}
            <span className="text-[11px] text-steel">Burns on every card you own — collection, binder, rips.</span>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setMuted(!muted)}
          aria-pressed={muted}
          aria-label={muted ? "Unmute pack sounds" : "Mute pack sounds"}
          title={muted ? "Unmute pack sounds" : "Mute pack sounds"}
          className="rounded-full border border-line px-3 py-1.5 text-sm text-steel transition-colors hover:border-coral hover:text-white"
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <Link
          href={`${base}/packs#collection`}
          className="text-xs text-steel underline-offset-4 hover:text-coral hover:underline"
        >
          Your collection ↓
        </Link>
        <span className="ml-auto text-xs text-steel">
          {openCount} {openCount === 1 ? "pack" : "packs"} opened
        </span>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {pulls ? (
        <PackOpening
          pulls={pulls}
          balance={balance}
          packCost={packCost}
          ownedSlugs={ownedSlugs}
          muted={muted}
          onOpenAnother={openAnother}
          onExit={handleExit}
          flame={flameKey}
        />
      ) : null}
    </section>
  );
}

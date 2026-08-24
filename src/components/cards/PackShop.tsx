"use client";

// The pack counter: buy a pack with betting dollars, then rip it open.
//
// Buying and rolling both happen server-side the moment the button is
// clicked, so the pack's contents are settled before anything appears on
// screen. What follows is staging, in two acts. First the sealed wrapper
// (PackRip), which the user physically tears open — it knows the best rarity
// inside and glows accordingly, which is the only thing the theater is
// allowed to leak. Then the five pulls land one at a time, worst rarity
// first, so the pack builds to its best card instead of dumping everything at
// once — the chase card is always the last one on the table. Each card plays
// PlayerCard3D's `reveal` flip as it mounts, so the stagger here only decides
// *when* a card enters; the flip animation itself belongs to the card.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtPoints } from "@/lib/betting/format";
import type { PlayerCardData } from "@/lib/cards/build";
import type { CardLeague } from "@/lib/cards/queries";
import { openPackAction } from "@/lib/packs/actions";
import { rarityOf, rarityRank } from "@/lib/packs/config";
import type { RarityClass } from "@/lib/packs/config";
import { getMuted, getMutedServer, revealTone, setMuted, subscribeMuted } from "@/lib/packs/sounds";
import PackRip from "./PackRip";
import PlayerCard3D from "./PlayerCard3D";

/** Gap between cards landing. Long enough that each pull gets its own beat
 *  (the card's own reveal flip runs 850ms), short enough that five cards
 *  don't outstay the moment. */
const REVEAL_MS = 700;

interface Pull {
  card: PlayerCardData;
  foil: boolean;
  /** This copy pulled autographed — rarer than foil, and chipped louder. */
  signed: boolean;
  inventoryId: number;
}

/** Worst → best, so the last card revealed is the pack's chase. Rarity is
 *  the headline; overall breaks ties inside a class. */
function byRarityAscending(a: Pull, b: Pull): number {
  const gap = rarityRank(rarityOf(a.card.tier.key)) - rarityRank(rarityOf(b.card.tier.key));
  return gap !== 0 ? gap : a.card.overall - b.card.overall;
}

export default function PackShop({
  league,
  balance: initialBalance,
  packCost,
  openCount: initialOpenCount,
}: {
  league: CardLeague;
  balance: number;
  packCost: number;
  openCount: number;
}) {
  const router = useRouter();
  const [balance, setBalance] = useState(initialBalance);
  const [openCount, setOpenCount] = useState(initialOpenCount);
  const [pulls, setPulls] = useState<Pull[] | null>(null);
  const [shown, setShown] = useState(0);
  /** The wrapper is still on — cards are rolled but nobody's seen them. */
  const [sealed, setSealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Mute belongs to the audio module, not to this component: the reveal blips
  // below and the rip noises inside PackRip are the same setting, and it's
  // persisted across sessions. Reading it as an external store keeps the
  // server render (always unmuted) honest.
  const muted = useSyncExternalStore(subscribeMuted, getMuted, getMutedServer);

  // Kept in a ref so muting mid-reveal doesn't re-run the blip effect below
  // and replay the card that just landed.
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  });

  // One more card lands every REVEAL_MS until the pack is out. Driven off
  // `shown` rather than a single interval so a second pack opened mid-reveal
  // restarts the run cleanly.
  useEffect(() => {
    if (sealed || !pulls || shown >= pulls.length) return;
    const timer = setTimeout(() => setShown((n) => n + 1), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [sealed, pulls, shown]);

  // A blip per card as it lands, pitched by rarity — the run climbs.
  useEffect(() => {
    if (!pulls || shown === 0 || mutedRef.current) return;
    const landed = pulls[shown - 1];
    if (landed) revealTone(rarityRank(rarityOf(landed.card.tier.key)));
  }, [pulls, shown]);

  const revealing = pulls !== null && shown < pulls.length;
  const busy = pending || revealing;

  function handleOpen() {
    setError(null);
    setPulls(null);
    setShown(0);
    setSealed(false);
    startTransition(async () => {
      const result = await openPackAction(league);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPulls([...result.cards].sort(byRarityAscending));
      // Nothing lands until the wrapper comes off; PackRip's onOpened starts
      // the run. Unsealing unmounts PackRip, so "Open another" always gets a
      // pack that's freshly sealed rather than one holding a torn rip's state.
      setSealed(true);
      setBalance(result.balance);
      setOpenCount((n) => n + 1);
      // The collection below is server-rendered, so it only learns about
      // these cards on a refresh. The pulls on screen are local state and
      // survive it — the opening keeps playing while the grid catches up.
      router.refresh();
    });
  }

  const handleOpened = useCallback(() => {
    setSealed(false);
    setShown(1); // card i lands at i * REVEAL_MS — the first one right away
  }, []);

  function toggleMute() {
    setMuted(!muted);
  }

  // Pulls are sorted worst→best, so the chase card is the last one — and the
  // aura's color and the sting's shape are both read off it.
  const bestRarity: RarityClass = pulls?.length
    ? rarityOf(pulls[pulls.length - 1].card.tier.key)
    : "common";
  const hasSigned = pulls?.some((pull) => pull.signed) ?? false;

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
        <button
          type="button"
          onClick={handleOpen}
          disabled={busy}
          className="btn-coral px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Opening…" : `Open pack — ${fmtPoints(packCost)}`}
        </button>
        <button
          type="button"
          onClick={toggleMute}
          aria-pressed={muted}
          aria-label={muted ? "Unmute pack sounds" : "Mute pack sounds"}
          title={muted ? "Unmute pack sounds" : "Mute pack sounds"}
          className="rounded-full border border-line px-3 py-1.5 text-sm text-steel transition-colors hover:border-coral hover:text-white"
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <span className="ml-auto text-xs text-steel">
          {openCount} {openCount === 1 ? "pack" : "packs"} opened
        </span>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {pulls ? (
        <div className="flex flex-col items-center gap-6">
          {sealed ? (
            <PackRip
              bestRarity={bestRarity}
              hasSigned={hasSigned}
              muted={muted}
              onOpened={handleOpened}
            />
          ) : null}
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-6">
            {pulls.slice(0, shown).map((pull) => (
              <div key={pull.inventoryId} className="flex flex-col items-center gap-2">
                <PlayerCard3D card={pull.card} reveal forceFoil={pull.foil} />
                <div className="flex flex-col items-center gap-1 text-center">
                  <span className="text-sm font-semibold text-white">{pull.card.name}</span>
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-steel">
                    {pull.card.tier.label}
                  </span>
                  {pull.signed ? (
                    <span className="rounded-full border border-gold bg-gold/20 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-[0.2em] text-gold [text-shadow:0_0_10px_rgb(245_182_46/0.8)]">
                      ✍ Signed
                    </span>
                  ) : null}
                  {pull.foil ? (
                    <span className="rounded-full border border-gold/50 bg-gold/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.2em] text-gold">
                      ✦ Foil
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {!revealing ? (
            <button
              type="button"
              onClick={handleOpen}
              disabled={busy}
              className="btn-coral px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Opening…" : "Open another"}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

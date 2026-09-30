"use client";

// The pack opening, as a place rather than a widget.
//
// Everything a pack does now happens on a full-screen stage that owns the
// browser for the length of the ritual, in five phases:
//
//   drop     the sealed pack falls into a spotlight and lands with a thud
//   rip      PackRip's mechanics, unchanged, with the room swelling around it
//   line     five CARD BACKS fanned in an arc — nothing auto-reveals
//   walkout  a pull good enough to stop the opening takes the whole screen
//   summary  what the pack was worth, and the door back to another one
//
// The line is the load-bearing change. The old shop dealt the five cards out
// on a timer, which meant the user watched their pack rather than opened it;
// here every card stays face-down until someone turns it, and each back glows
// in *its own* card's rarity. Seeing a gold back two slots from the end and
// having to decide whether to save it for last is the entire game — it's the
// same trick Hearthstone plays, and it costs nothing but withheld information
// the pack was already sitting on.
//
// The order is still worst → best left to right, so the chase card is the
// last one you can turn. What changes is that you *choose* to turn it.
//
// Nothing here can alter a pull: the pack was paid for, rolled and written to
// the database before this component mounted (see packs/actions.ts). The
// phases are staging over a settled outcome, which is why Escape is allowed
// to skip the lot — it flips everything face-up and jumps to the summary,
// because a user who doesn't want the theater has still bought the cards.

import { useCallback, useEffect, useRef, useState } from "react";
import { cardArtUrls, preloadArt } from "@/lib/cards/artUrls";
import { fmtPoints } from "@/lib/betting/format";
import { canDust, rarityRank } from "@/lib/packs/config";
import type { PackVariant, RarityClass } from "@/lib/packs/config";
import { flipTone, godPackFinaleSting, packDropThud, setMuted, walkoutSting } from "@/lib/packs/sounds";
import PackRip from "./PackRip";
import { prefersReducedMotion } from "@/lib/ui/reducedMotion";
import PlayerCard3D from "./PlayerCard3D";
import PackCardBack from "./PackCardBack";
import PackPullCaption from "./PackPullCaption";
import PackSummary from "./PackSummary";
import PackWalkout from "./PackWalkout";
import {
  PACK_RARITY_CLASS,
  arcAngle,
  arcLift,
  buzz,
  markNew,
  orderPulls,
  pullDustValue,
  pullRarity,
  walkoutLabels,
  type AutoDusted,
  type OpenResult,
  type Pull,
} from "./packOpeningModel";

// The stage's contract lives in the model; PackShop, SeasonEndPackShop and
// the admin preview import it from here.
export type { AutoDusted, OpenResult, Pull } from "./packOpeningModel";

type Phase = "drop" | "rip" | "line" | "summary";

/** How long the pack takes to fall and settle — matches packDropIn. */
const DROP_MS = 900;
const CLIENT_TIMING_ENABLED = process.env.NEXT_PUBLIC_PACK_OPEN_TIMING === "1";
/** Where in that fall the pack meets the table (the 58% keyframe). */
const THUD_MS = 520;
/** Length of the screen shake, matching packShake. */
const SHAKE_MS = 560;
/** Gap between cards when "Flip all" is doing the turning. Slower than a
 *  reveal timer used to be — this is a user who opted out of clicking, not a
 *  user who opted out of watching. */
const FLIP_ALL_MS = 260;

export default function PackOpening({
  pulls: firstPack,
  balance: initialBalance,
  packCost,
  ownedSlugs,
  muted,
  onOpenAnother,
  autoDusted = null,
  onExit,
  onSellPack,
  flame = null,
  patron = false,
  variant: initialVariant = "standard",
  openingId: initialOpeningId = null,
  revealOrder: initialRevealOrder = [],
  preserveOrder: initialPreserveOrder = false,
  autoDustProtected: initialAutoDustProtected = false,
  diagnosticStartedAt = null,
  packLabel = "Pack",
  packValue,
  summaryNote,
  preview = false,
}: {
  /** The pack that's just been paid for. God Packs use the persisted order. */
  pulls: Pull[];
  balance: number;
  packCost: number;
  /** Slugs already in the collection, for the NEW badge. */
  ownedSlugs: string[];
  muted: boolean;
  /** Buy and roll another pack. Returning `{ok:false}` keeps the overlay up
   *  and shows the error in the summary bar. */
  onOpenAnother: () => Promise<OpenResult>;
  /** Copies the auto-dust rule already destroyed out of this pack. They
   *  stay on the stage (you still get to see them) but show as dusted. */
  autoDusted?: AutoDusted | null;
  /** Tear the stage down (and let the collection behind it catch up). */
  onExit: () => void;
  /** Dust the whole pack back into dollars. Owned by the shop for the same
   *  reason onOpenAnother is — the wallet lives there. Absent hides the
   *  button entirely. */
  onSellPack?: (inventoryIds: number[]) => Promise<
    { ok: true; dusted: number; value: number; balance: number; skipped: number } | { ok: false; error: string }
  >;
  /** The ripper's Patron Flame — they own every pull on this stage. */
  flame?: string | null;
  /** Active patron opening this pack — the sell-all quote carries their
   *  20% dust bonus, same helper the server credits by. */
  patron?: boolean;
  /** Server-owned presentation metadata for standard openings. */
  variant?: PackVariant;
  openingId?: string | null;
  revealOrder?: number[];
  /** Keep a server-defined order for event packs instead of sorting by rarity. */
  preserveOrder?: boolean;
  autoDustProtected?: boolean;
  /** Local diagnostic timestamp from the click that bought this pack. */
  diagnosticStartedAt?: number | null;
  /** Optional presentation overrides for non-player collectible packs. */
  packLabel?: string;
  packValue?: number | null;
  summaryNote?: string;
  /** Admin fixture mode: no wallet controls or production actions. */
  preview?: boolean;
}) {
  // Read once, on mount: the overlay is on screen for a minute at a time, and
  // re-deciding mid-ritual whether to have a ritual is worse than either
  // answer. Same call PackRip makes, so the two can't disagree.
  const [reduced] = useState(prefersReducedMotion);
  const initialPulls = orderPulls(firstPack, initialVariant, initialRevealOrder, initialPreserveOrder);

  // One state object for everything that turns over together when a new pack
  // arrives — the pulls, their NEW flags, and the running set of slugs the
  // session has seen (so a repeat player in pack three isn't marked NEW).
  const [pack, setPack] = useState(() => {
    const pulls = initialPulls;
    const marked = markNew(pulls, new Set(ownedSlugs));
    return {
      index: 0,
      pulls,
      isNew: marked.flags,
      seen: marked.seen,
      variant: initialVariant,
      openingId: initialOpeningId,
      revealOrder: initialRevealOrder,
      preserveOrder: initialPreserveOrder,
      autoDustProtected: initialAutoDustProtected,
    };
  });

  const [phase, setPhase] = useState<Phase>("drop");
  const [flipped, setFlipped] = useState<boolean[]>(() => initialPulls.map(() => false));
  const [walkoutQueue, setWalkoutQueue] = useState<number[]>([]);
  const [autoFlip, setAutoFlip] = useState(false);
  const [progress, setProgress] = useState(0);
  const [shaking, setShaking] = useState(false);
  const [balance, setBalance] = useState(initialBalance);
  const [sessionCount, setSessionCount] = useState(1);
  // Phone layout reveals ONE card at a time. The fan below 540px shrank each
  // card to 92px — under a third of its design size, five of them overlapping
  // on a 390px screen — so the name, the OVR and the bars were all
  // unreadable and the flip target was a sliver. Desktop keeps the fan.
  const [narrow, setNarrow] = useState(false);
  /** Which card the solo (narrow) view is showing. Reset on every new
   *  pack — see handleOpenAnother. It used to survive one, so a phone
   *  that had walked to card five opened the NEXT pack already on card
   *  five: `index !== cursor` hid the other four and there was no "next"
   *  left to press. Desktop never saw it, because the fan renders all
   *  five and ignores the cursor entirely. */
  const [cursor, setCursor] = useState(0);
  /** True for the length of a flip. The card's ambient loops (halo, sparkles,
   *  drifting frame) are paused while it turns — nobody can read them edge-on,
   *  and on a phone they were competing for the same frames as the rotation. */
  const [turning, setTurning] = useState(false);
  const [bestPull, setBestPull] = useState<Pull | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // The sell button is a two-tap: "Sell pack" arms it, the second tap
  // commits. "sold" is terminal for THIS pack — Open another re-arms it.
  /** Which dust the second tap will commit — "all" and "picked" arm
   *  SEPARATELY, so arming one disarms the other and a confirm can never
   *  destroy a bigger set than the button that was armed said it would. */
  const [armedSell, setArmedSell] = useState<"all" | "picked" | null>(null);
  const [selling, setSelling] = useState(false);
  /** Running total for THIS pack: a partial dust is not terminal any more,
   *  so these accumulate across several. */
  const [sold, setSold] = useState<{ dusted: number; value: number } | null>(null);
  /** Copies already destroyed out of this pack — they stay on the stage
   *  (you paid to see them) but can't be picked or dusted twice. */
  const [dustedIds, setDustedIds] = useState<ReadonlySet<number>>(() => new Set(autoDusted?.ids ?? []));
  /** What the rule took automatically — shown beside the hand-dusted
   *  total, not folded into it, so "I didn't tap that" has an answer. */
  const [auto, setAuto] = useState<AutoDusted | null>(autoDusted?.dusted ? autoDusted : null);
  /** The cards ticked for dusting. Empty means "nothing picked", which is
   *  why Dust all is a separate button rather than the same one with a
   *  different meaning. */
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const [sellError, setSellError] = useState<string | null>(null);

  // `flipped` is mirrored into a ref because turning a card is not an
  // idempotent state update — it also plays a tone and can queue a walkout,
  // and a double click inside one render must not do either twice.
  const flippedRef = useRef(flipped);
  const burstedRef = useRef(false);
  const mutedRef = useRef(muted);
  const reducedRef = useRef(reduced);
  useEffect(() => {
    mutedRef.current = muted;
    reducedRef.current = reduced;
  });

  // Warm the art the moment a pack lands, not when each card flips.
  //
  // Card art is lazy everywhere, which is right for a shelf and wrong here:
  // these five are already decided, the stage opens on backs that nobody has
  // turned yet, and that gap is free download time. Without it the flip
  // played against an empty frame and the splash arrived after the
  // animation — the slowest-feeling part of opening a pack was the part
  // that had already finished.
  useEffect(() => {
    preloadArt(pack.pulls.flatMap((pull) => (pull.card ? cardArtUrls(pull.card) : [])));
  }, [pack.pulls]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(max-width: 540px)");
    const sync = () => setNarrow(query.matches);
    sync();
    query.addEventListener?.("change", sync);
    return () => query.removeEventListener?.("change", sync);
  }, []);

  const count = pack.pulls.length;
  const activeWalkout = walkoutQueue.length > 0 ? walkoutQueue[0] : null;
  const isGodPack = pack.variant === "god";
  // Sorted worst→best, so the chase card is the last one — and the room's
  // color is read off it, the same thing the sealed pack was already leaking.
  const bestRarity: RarityClass = count > 0 ? pullRarity(pack.pulls[count - 1]) : "common";
  const hasSigned = pack.pulls.some((pull) => pull.signed);
  const sealed = phase === "drop" || phase === "rip";

  const anyFlipped = flipped.some(Boolean);
  const allFlipped = flipped.every(Boolean);
  // The summary isn't a phase the line transitions *into* — it's what the
  // line *is* once every card is face-up and no walkout is still owed. Deriving
  // it rather than setting it from an effect keeps a five-card pack from
  // costing an extra render on the last flip, and means the state machine only
  // has to be moved by things a user actually did.
  const view: Phase = phase === "line" && allFlipped && activeWalkout === null ? "summary" : phase;
  /** One-card-at-a-time reveal: phones only, and only while still revealing —
   *  the summary is a contact sheet of the whole pack on every screen. */
  const solo = narrow && view === "line";
  /** The cursor, clamped to the pack actually on screen. Belt and braces
   *  for the reset above: a cursor past the end renders NO card at all
   *  rather than the wrong one, which is a blank screen with no way out. */
  const soloIndex = Math.min(cursor, Math.max(0, pack.pulls.length - 1));

  // The page behind the overlay must not scroll under it.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // The drop lands, and the pack becomes something you can tear. Guarded
  // against a phase that has already moved on — under reduced motion PackRip
  // opens on mount, which can beat this timer.
  useEffect(() => {
    if (phase !== "drop") return;
    const timer = setTimeout(() => setPhase((current) => (current === "drop" ? "rip" : current)), DROP_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (!CLIENT_TIMING_ENABLED || phase !== "rip" || diagnosticStartedAt === null) return;
    console.info("packs: browser timing", {
      stage: "click_to_rip_ready",
      durationMs: Math.round((performance.now() - diagnosticStartedAt) * 10) / 10,
    });
  }, [diagnosticStartedAt, phase]);

  useEffect(() => {
    if (phase !== "drop" || reducedRef.current || mutedRef.current) return;
    const timer = setTimeout(() => packDropThud(), THUD_MS);
    return () => clearTimeout(timer);
  }, [phase, pack.index]);

  useEffect(() => {
    if (!shaking) return;
    const timer = setTimeout(() => setShaking(false), SHAKE_MS);
    return () => clearTimeout(timer);
  }, [shaking]);

  /** Remember the session's headline pull — rarity first, rating as the
   *  tie-break, same order the line is sorted in. */
  const notePull = useCallback((pull: Pull) => {
    setBestPull((previous) => {
      if (!previous) return pull;
      const before = rarityRank(pullRarity(previous));
      const after = rarityRank(pullRarity(pull));
      if (after > before) return pull;
      if (after === before && (pull.card?.overall ?? 0) > (previous.card?.overall ?? 0)) return pull;
      return previous;
    });
  }, []);

  const flipCard = useCallback(
    (index: number) => {
      if (flippedRef.current[index]) return;
      const next = flippedRef.current.slice();
      next[index] = true;
      flippedRef.current = next;
      setFlipped(next);

      setTurning(true);
      window.setTimeout(() => setTurning(false), 520);

      const pull = pack.pulls[index];
      if (!pull) return;
      const rarity = pullRarity(pull);
      if (!mutedRef.current) flipTone(rarityRank(rarity));
      const godFinale = pack.variant === "god" && index === pack.pulls.length - 1;
      if (walkoutLabels(pull).length === 0 && !godFinale) return;
      notePull(pull);
      // Queued rather than shown: "Flip all" can turn several qualifying
      // cards before the first takeover has been dismissed, and they're owed
      // one screen each, in flip order.
      if (!reducedRef.current) setWalkoutQueue((queue) => [...queue, index]);
    },
    [pack.pulls, pack.variant, notePull],
  );

  /** Turn everything face-up at once and go straight to the summary — the
   *  Escape hatch, and the whole of the reduced-motion path. No walkouts:
   *  they're an interruption, and this is someone asking not to be. */
  const revealAll = useCallback(() => {
    const next = flippedRef.current.map(() => true);
    flippedRef.current = next;
    setFlipped(next);
    setWalkoutQueue([]);
    setAutoFlip(false);
    pack.pulls.forEach((pull) => {
      if (walkoutLabels(pull).length > 0) notePull(pull);
    });
    setPhase("summary");
  }, [pack.pulls, notePull]);

  const dismissWalkout = useCallback(() => setWalkoutQueue((queue) => queue.slice(1)), []);

  // Reduced motion: PackRip skips itself, so the line arrives immediately —
  // and there's nothing left to reveal one card at a time either.
  useEffect(() => {
    if (!reduced || phase !== "line") return;
    revealAll();
  }, [reduced, phase, revealAll]);

  // The sting belongs to the takeover appearing, not to the flip that queued
  // it — a walkout waiting three cards deep should still land on entrance.
  useEffect(() => {
    if (activeWalkout === null || mutedRef.current) return;
    const pull = pack.pulls[activeWalkout];
    if (!pull) return;
    if (isGodPack && activeWalkout === count - 1) godPackFinaleSting(pull.signed);
    else walkoutSting(pullRarity(pull), pull.signed);
  }, [activeWalkout, count, isGodPack, pack.pulls]);

  // "Flip all" turns the rest one at a time rather than all at once, and
  // stalls while a walkout is up — the impatient path still gets the beats.
  useEffect(() => {
    if (!autoFlip || phase !== "line" || activeWalkout !== null) return;
    const next = flipped.findIndex((face) => !face);
    if (next < 0) return;
    const timer = setTimeout(() => flipCard(next), FLIP_ALL_MS);
    return () => clearTimeout(timer);
  }, [autoFlip, phase, activeWalkout, flipped, flipCard]);

  // Escape is honoured everywhere, because the cards are already bought — but
  // it skips to the summary rather than closing, so nobody Escapes their pack
  // into the void. A walkout eats it first, as a dismissal.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (activeWalkout !== null) {
        if (event.key !== "Escape" && event.key !== "Enter") return;
        // A focused button already turns Enter into a click; letting this
        // through as well would dismiss two walkouts on one press.
        if (event.key === "Enter" && document.activeElement instanceof HTMLButtonElement) return;
        event.preventDefault();
        dismissWalkout();
        return;
      }
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (view === "summary") onExit();
      else revealAll();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeWalkout, dismissWalkout, view, revealAll, onExit]);

  const handleOpened = useCallback(() => setPhase((current) => (current === "line" ? current : "line")), []);

  const handleProgress = useCallback((value: number) => {
    setProgress(value);
    // Progress only reaches 1 when the foil gives way, so this is the burst.
    if (value < 1 || burstedRef.current) return;
    burstedRef.current = true;
    setShaking(true);
    if (!reducedRef.current) buzz([18, 40, 26]);
  }, []);

  async function handleOpenAnother() {
    setPending(true);
    setError(null);
    const result = await onOpenAnother();
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const variant = result.variant ?? "standard";
    const pulls = orderPulls(result.cards, variant, result.revealOrder, result.preserveOrder ?? pack.preserveOrder);
    const marked = markNew(pulls, pack.seen);
    const blank = pulls.map(() => false);
    flippedRef.current = blank;
    burstedRef.current = false;
    setPack({
      index: pack.index + 1,
      pulls,
      isNew: marked.flags,
      seen: marked.seen,
      variant,
      openingId: result.openingId ?? null,
      revealOrder: result.revealOrder ?? pulls.map((pull) => pull.inventoryId),
      preserveOrder: result.preserveOrder ?? pack.preserveOrder,
      autoDustProtected: result.autoDustProtected === true,
    });
    setFlipped(blank);
    setCursor(0);
    setWalkoutQueue([]);
    setAutoFlip(false);
    setProgress(0);
    setBalance(result.balance);
    setSessionCount((n) => n + 1);
    setArmedSell(null);
    setSelling(false);
    setSold(null);
    setDustedIds(new Set(result.autoDusted?.ids ?? []));
    setAuto(result.autoDusted?.dusted ? result.autoDusted : null);
    setPicked(new Set());
    setSellError(null);
    setPhase("drop");
  }

  /** Tick a card for dusting. Already-dusted copies are inert. */
  function togglePick(inventoryId: number) {
    if (dustedIds.has(inventoryId)) return;
    // A one-of-one is never in the dust set, whatever was tapped.
    if (pack.pulls.some((pull) => pull.inventoryId === inventoryId && pull.card && !canDust(pull))) return;
    setSellError(null);
    // A changed selection un-arms: the confirm you are about to give must
    // belong to the set currently on screen.
    setArmedSell(null);
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(inventoryId)) next.add(inventoryId);
      return next;
    });
  }

  /**
   * Dust a set of the pack, in two taps.
   *
   * `mode` is carried through the arm so the confirm commits exactly the
   * button that was armed — arming "all" and then ticking a card cannot
   * turn the pending confirm into something smaller, and vice versa.
   */
  async function handleSell(mode: "all" | "picked") {
    if (!onSellPack || selling) return;
    const ids =
      mode === "all"
        ? pack.pulls.filter((pull) => pull.card && canDust(pull)).map((pull) => pull.inventoryId).filter((id) => !dustedIds.has(id))
        : [...picked];
    if (ids.length === 0) return;

    if (armedSell !== mode) {
      // Arm, don't fire: destroying cards you just paid for deserves a
      // deliberate second tap, not a misclick.
      setArmedSell(mode);
      setSellError(null);
      return;
    }

    setArmedSell(null);
    setSelling(true);
    const result = await onSellPack(ids);
    setSelling(false);
    if (!result.ok) {
      setSellError(result.error);
      return;
    }
    // The server reports how many it actually destroyed, and it may be
    // fewer than were asked for (a copy locked into a lineup between
    // render and tap). Only what it dusted comes off the stage — marking
    // all of them would hide a card the player still owns.
    setDustedIds((current) => {
      const next = new Set(current);
      for (const id of ids.slice(0, result.dusted)) next.add(id);
      return next;
    });
    setPicked((current) => {
      const next = new Set(current);
      for (const id of ids) next.delete(id);
      return next;
    });
    setSold((current) => ({
      dusted: (current?.dusted ?? 0) + result.dusted,
      value: (current?.value ?? 0) + result.value,
    }));
    setBalance(result.balance);
    setSellError(
      result.skipped > 0 ? `${result.skipped} card${result.skipped === 1 ? "" : "s"} couldn't be sold.` : null,
    );
  }

  /** What one pull dusts for, at this opener's patron rate. */
  const dustValueOfPull = (pull: Pull): number => pullDustValue(pull, patron);

  const dustTotal = pack.pulls.reduce((sum, pull) => sum + dustValueOfPull(pull), 0);
  /** What is still on the stage, and what the two buttons are worth. */
  // "Dust all" means everything that CAN be dusted: an Eclipse in the pack
  // stays on the stage and out of the count, or the button would offer to
  // destroy the one card the server will refuse.
  const remaining = pack.pulls.filter((pull) => !dustedIds.has(pull.inventoryId) && canDust(pull));
  const remainingTotal = remaining.reduce((sum, pull) => sum + dustValueOfPull(pull), 0);
  const pickedPulls = pack.pulls.filter((pull) => picked.has(pull.inventoryId));
  const pickedTotal = pickedPulls.reduce((sum, pull) => sum + dustValueOfPull(pull), 0);
  const newCount = pack.isNew.filter(Boolean).length;
  // The rays are the loudest thing on the stage, so they're spent sparingly:
  // a legendary-topped pack while it's still sealed, and any walkout.
  const showRays = (sealed && bestRarity === "legendary") || activeWalkout !== null;
  const vignette = sealed ? 0.16 + progress * 0.54 : view === "line" ? 0.22 : 0.14;

  const walkoutPull = activeWalkout !== null ? pack.pulls[activeWalkout] : null;

  return (
    <div
      className={`pack-overlay ${PACK_RARITY_CLASS[bestRarity]} ${isGodPack ? "god-pack-overlay" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={isGodPack ? "Opening a God Pack" : "Opening a card pack"}
      data-opening-id={pack.openingId ?? undefined}
    >
      <p className="sr-only" role="status" aria-live="polite">
        {isGodPack ? "God Pack opened: five special cards, with the signed finale revealed last." : ""}
      </p>
      <div className="pack-vignette" aria-hidden style={{ opacity: vignette }} />
      <div className="pack-spotlight" aria-hidden />
      {showRays ? <div className="pack-rays" aria-hidden /> : null}

      <div className="relative z-10 flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <span className="label-dash">
          {packLabel} {sessionCount} · {fmtPoints(balance)}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMuted(!muted)}
            aria-pressed={muted}
            aria-label={muted ? "Unmute pack sounds" : "Mute pack sounds"}
            className="rounded-full border border-border-strong px-3 py-1.5 text-sm text-muted transition-colors hover:border-action-text hover:text-white"
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <button
            type="button"
            onClick={view === "summary" ? onExit : revealAll}
            className="rounded-full border border-border-strong px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-muted transition-colors hover:border-action-text hover:text-white"
          >
            {view === "summary" ? "Close" : "Skip"}
          </button>
        </div>
      </div>

      <div className={`pack-arena ${shaking ? "pack-arena-shake" : ""}`}>
        {sealed ? (
          <div className={reduced ? undefined : "pack-drop-in"}>
            <PackRip
              // A fresh instance per pack, so "Open another" never gets a
              // wrapper still holding the last rip's torn state.
              key={pack.index}
              bestRarity={bestRarity}
              hasSigned={hasSigned}
              godPack={isGodPack}
              // The wrapper knows what it holds: a Faceless Pack prints the
              // drop's markings instead of the five-cards-one-rare promise.
              champions={pack.pulls.some((pull) => Boolean(pull.card?.champWin))}
              muted={muted}
              onOpened={handleOpened}
              onProgress={handleProgress}
            />
          </div>
        ) : (
          <>
            <div className={`pack-line ${solo ? "pack-line-solo" : ""}`}>
              {pack.pulls.map((pull, index) => {
                // Phones show one card; the summary still lays them all out.
                if (solo && index !== soloIndex) return null;
                const rarity = pullRarity(pull);
                const face = flipped[index];
                // A lone card has nothing to fan against, so it sits straight.
                const straight = view === "summary" || solo;
                return (
                  <div
                    key={pull.inventoryId}
                    className="flex flex-col items-center gap-2"
                    style={{
                      zIndex: index,
                      marginLeft: solo ? 0 : index === 0 ? 0 : straight ? 10 : -22,
                      transition: "margin 420ms ease",
                    }}
                  >
                    <div
                      className="pack-slot"
                      style={{
                        transform: straight
                          ? "rotate(0deg) translateY(0px)"
                          : `rotate(${arcAngle(index, count)}deg) translateY(${arcLift(index, count)}px)`,
                        transition: "transform 420ms ease",
                      }}
                    >
                      <div
                        className={`pack-flip ${turning ? "pack-flip-turning" : ""}`}
                        style={{ transform: face ? "rotateY(180deg)" : "rotateY(0deg)" }}
                      >
                        <div className="pack-flip-face">
                          <PackCardBack
                            rarity={rarity}
                            signed={pull.signed}
                            godPack={isGodPack}
                            revealed={face}
                            flame={flame}
                            label={`Reveal card ${index + 1} of ${count}`}
                            onFlip={() => flipCard(index)}
                          />
                        </div>
                        <div className="pack-flip-face pack-flip-face-rear">
                          {face ? (
                            <div className="pack-line-card">
                              {/* Interactive: the revealed pulls tilt and catch their foil under
                                  the pointer like anywhere else. The rear face
                                  counter-rotates the flip container, so the tilt
                                  reads the right way round in here. */}
                              {/* gyro on the phone reveal: this is the card
                                  being looked at, and on a phone it is the
                                  only one on screen. */}
                              {pull.renderFace ?? (pull.card ? (
                                <PlayerCard3D
                                  card={pull.card}
                                  gyro={solo}
                                  forceFoil={pull.foil}
                                  foilType={pull.foilType}
                                  flame={flame}
                                />
                              ) : null)}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {face ? (
                      <PackPullCaption
                        pull={pull}
                        isNew={pack.isNew[index]}
                        showDust={Boolean(onSellPack) && !preview && view === "summary"}
                        dusted={dustedIds.has(pull.inventoryId)}
                        picked={picked.has(pull.inventoryId)}
                        selling={selling}
                        dustValue={dustValueOfPull(pull)}
                        onTogglePick={() => togglePick(pull.inventoryId)}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
            {/* Phone reveal: where you are in the pack, and the way forward.
                Next only unlocks once the current card is face-up, so the
                pack can't be skimmed past without being seen. */}
            {solo ? (
              <div className="relative mt-3 flex items-center justify-center gap-4">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  {soloIndex + 1} / {count}
                </span>
                {soloIndex < count - 1 ? (
                  <button
                    type="button"
                    onClick={() => setCursor((c) => Math.min(c + 1, count - 1))}
                    disabled={!flipped[soloIndex]}
                    className="btn-pill px-5 py-2 text-sm disabled:opacity-40"
                  >
                    Next card →
                  </button>
                ) : null}
              </div>
            ) : null}

            <p className="relative mt-6 text-xs uppercase tracking-[0.22em] text-muted">
              {allFlipped ? "That's the pack" : "Tap a card to turn it over"}
            </p>
            {anyFlipped && !allFlipped ? (
              <button
                type="button"
                onClick={() => setAutoFlip(true)}
                className="relative mt-3 rounded-full border border-border-strong px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-muted transition-colors hover:border-action-text hover:text-white"
              >
                Flip all
              </button>
            ) : null}
          </>
        )}
      </div>

      {view === "summary" ? (
        <PackSummary
          godPack={isGodPack}
          packValue={packValue}
          dustTotal={dustTotal}
          newCount={newCount}
          count={count}
          balance={balance}
          sessionCount={sessionCount}
          bestPull={bestPull}
          summaryNote={summaryNote}
          error={error}
          sellError={sellError}
          auto={auto}
          autoDustProtected={pack.autoDustProtected}
          sold={sold}
          showSell={Boolean(onSellPack) && !preview && remaining.length > 0}
          pickedCount={picked.size}
          pickedTotal={pickedTotal}
          remainingCount={remaining.length}
          remainingTotal={remainingTotal}
          armedSell={armedSell}
          selling={selling}
          pending={pending}
          preview={preview}
          packCost={packCost}
          onSell={handleSell}
          onOpenAnother={handleOpenAnother}
          onExit={onExit}
        />
      ) : null}

      {walkoutPull ? (
        <PackWalkout
          pull={walkoutPull}
          finale={isGodPack && activeWalkout === count - 1}
          flame={flame}
          onDismiss={dismissWalkout}
        />
      ) : null}
    </div>
  );
}

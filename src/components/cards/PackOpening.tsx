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
import { fmtPoints } from "@/lib/betting/format";
import type { PlayerCardData } from "@/lib/cards/build";
import { dustValueOf, rarityOf, rarityRank } from "@/lib/packs/config";
import type { RarityClass } from "@/lib/packs/config";
import { flipTone, packDropThud, setMuted, walkoutSting } from "@/lib/packs/sounds";
import { PATRON_FLAMES, patronFlameOf } from "@/lib/patron/flames";
import PatronFlame from "@/components/patron/PatronFlame";
import PackRip, { prefersReducedMotion } from "./PackRip";
import PlayerCard3D from "./PlayerCard3D";

/** One card out of a pack, exactly as openPackAction hands it over. */
export interface Pull {
  card: PlayerCardData;
  foil: boolean;
  /** Which parallel — null on a matte pull. */
  foilType: string | null;
  /** This copy pulled autographed — rarer than foil, and stung louder. */
  signed: boolean;
  inventoryId: number;
}

/** openPackAction's return, structurally. The overlay never calls the action
 *  itself — PackShop owns that, and hands the result back through
 *  `onOpenAnother` — so a failed re-open lands in the summary bar rather than
 *  tearing the stage down. */
export type OpenResult =
  | { ok: true; cards: Pull[]; balance: number }
  | { ok: false; error: string };

type Phase = "drop" | "rip" | "line" | "summary";

/** How long the pack takes to fall and settle — matches packDropIn. */
const DROP_MS = 900;
/** Where in that fall the pack meets the table (the 58% keyframe). */
const THUD_MS = 520;
/** Length of the screen shake, matching packShake. */
const SHAKE_MS = 560;
/** Gap between cards when "Flip all" is doing the turning. Slower than a
 *  reveal timer used to be — this is a user who opted out of clicking, not a
 *  user who opted out of watching. */
const FLIP_ALL_MS = 260;

const RARITY_GLOW: Record<RarityClass, string> = {
  common: "pack-rarity-common",
  rare: "pack-rarity-rare",
  epic: "pack-rarity-epic",
  legendary: "pack-rarity-legendary",
};

/** Fixed sparkle placements on a signed card's back, as percentages. */
const BACK_SPARKS = [
  { left: "12%", top: "14%", delay: "0s" },
  { left: "78%", top: "26%", delay: "0.7s" },
  { left: "22%", top: "76%", delay: "1.4s" },
];

/** The storm behind a walkout. Deterministic, so it reads as composed. */
const STORM_SPARKS = [
  { left: "8%", top: "18%", delay: "0s" }, { left: "22%", top: "62%", delay: "0.4s" },
  { left: "34%", top: "12%", delay: "0.9s" }, { left: "68%", top: "20%", delay: "0.2s" },
  { left: "82%", top: "58%", delay: "1.1s" }, { left: "90%", top: "26%", delay: "0.6s" },
  { left: "14%", top: "84%", delay: "1.3s" }, { left: "74%", top: "82%", delay: "0.8s" },
  { left: "46%", top: "88%", delay: "1.6s" }, { left: "56%", top: "6%", delay: "1.0s" },
];

/** Worst → best, so the chase card is the last back in the line. Rarity is
 *  the headline; overall breaks ties inside a class. */
function byRarityAscending(a: Pull, b: Pull): number {
  const gap = rarityRank(rarityOf(a.card.tier.key)) - rarityRank(rarityOf(b.card.tier.key));
  return gap !== 0 ? gap : a.card.overall - b.card.overall;
}

/** This copy printed in something other than the player's base splash. */
function isAltArt(pull: Pull): boolean {
  return (pull.card.artSkin ?? 0) > 0;
}

/**
 * Why this pull deserves the whole screen, in the order the labels stack.
 * Empty means it doesn't — the walkout has to stay rare enough to mean
 * something, so a lone foil or a lone alternate print is a badge in the line
 * and nothing more. A foil alternate print is two independent low rolls on
 * the same card, which is why that pair qualifies and neither half does.
 */
function walkoutLabels(pull: Pull): string[] {
  const rarity = rarityOf(pull.card.tier.key);
  const labels: string[] = [];
  if (rarity === "legendary") labels.push("👑 LEGENDARY");
  else if (rarityRank(rarity) >= rarityRank("epic")) labels.push("💎 DIAMOND PULL");
  if (pull.signed) labels.push("✍ SIGNED");
  if (pull.foil && isAltArt(pull)) labels.push("✦ FOIL ALT ART");
  return labels;
}

/**
 * Which of these pulls the user hasn't got a copy of yet, walking the pack in
 * order so a pack containing the same player twice marks the first one NEW
 * and the second one a duplicate. Pure: it returns the grown set rather than
 * mutating the one it was handed, so it's safe inside a state initializer.
 */
function markNew(pulls: Pull[], owned: Set<string>): { flags: boolean[]; seen: Set<string> } {
  const seen = new Set(owned);
  const flags = pulls.map((pull) => {
    if (seen.has(pull.card.slug)) return false;
    seen.add(pull.card.slug);
    return true;
  });
  return { flags, seen };
}

/** The shallow fan: −6° on the left through +6° on the right. */
function arcAngle(index: number, count: number): number {
  return count <= 1 ? 0 : -6 + (12 * index) / (count - 1);
}

/** Edges of the fan sit lower than the middle, the way a held hand does. */
function arcLift(index: number, count: number): number {
  return Math.abs(index - (count - 1) / 2) * 7;
}

/** A short buzz on the burst. Phones only, and never a reason to throw. */
function buzz(pattern: number[]): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    /* a silent burst is still a burst */
  }
}

/** The back of a card in the line: FPL-branded, and glowing in the rarity of
 *  the card behind it. A patron's packs deal from their own deck — the back
 *  borders and marks itself in their flame, with the flame riding it. */
function CardBack({
  rarity,
  signed,
  label,
  revealed,
  flame = null,
  onFlip,
}: {
  rarity: RarityClass;
  signed: boolean;
  label: string;
  /** Already turned — the back is still in the DOM for the flip to rotate
   *  away, but it must stop being a button the moment it faces backwards. */
  revealed: boolean;
  /** The opener's flame — patrons flip their own card backs. */
  flame?: string | null;
  onFlip: () => void;
}) {
  const flameStyle = flame ? PATRON_FLAMES[patronFlameOf(flame)] : null;
  return (
    <button
      type="button"
      onClick={onFlip}
      disabled={revealed}
      aria-hidden={revealed}
      tabIndex={revealed ? -1 : undefined}
      aria-label={label}
      className={`pack-card-back ${RARITY_GLOW[rarity]}`}
      style={flameStyle ? { borderColor: flameStyle.dash } : undefined}
    >
      <span className="pack-back-glow" aria-hidden />
      {signed
        ? BACK_SPARKS.map((spark) => (
            <span
              key={spark.left}
              aria-hidden
              className="pack-back-spark"
              style={{ left: spark.left, top: spark.top, animationDelay: spark.delay }}
            >
              ✦
            </span>
          ))
        : null}
      <span className="pack-back-mark">
        <span
          className="type-display pack-back-fpl"
          style={flameStyle ? { color: flameStyle.hot, textShadow: `0 0 16px ${flameStyle.core}` } : undefined}
        >
          FPL
        </span>
        <span className="pack-back-rule" aria-hidden style={flameStyle ? { background: flameStyle.core } : undefined} />
      </span>
      {flameStyle ? <PatronFlame flame={flame} radius="0.8rem" /> : null}
    </button>
  );
}

export default function PackOpening({
  pulls: firstPack,
  balance: initialBalance,
  packCost,
  ownedSlugs,
  muted,
  onOpenAnother,
  onExit,
  onSellPack,
  flame = null,
}: {
  /** The pack that's just been paid for, in any order — sorted here. */
  pulls: Pull[];
  balance: number;
  packCost: number;
  /** Slugs already in the collection, for the NEW badge. */
  ownedSlugs: string[];
  muted: boolean;
  /** Buy and roll another pack. Returning `{ok:false}` keeps the overlay up
   *  and shows the error in the summary bar. */
  onOpenAnother: () => Promise<OpenResult>;
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
}) {
  // Read once, on mount: the overlay is on screen for a minute at a time, and
  // re-deciding mid-ritual whether to have a ritual is worse than either
  // answer. Same call PackRip makes, so the two can't disagree.
  const [reduced] = useState(prefersReducedMotion);

  // One state object for everything that turns over together when a new pack
  // arrives — the pulls, their NEW flags, and the running set of slugs the
  // session has seen (so a repeat player in pack three isn't marked NEW).
  const [pack, setPack] = useState(() => {
    const pulls = [...firstPack].sort(byRarityAscending);
    const marked = markNew(pulls, new Set(ownedSlugs));
    return { index: 0, pulls, isNew: marked.flags, seen: marked.seen };
  });

  const [phase, setPhase] = useState<Phase>("drop");
  const [flipped, setFlipped] = useState<boolean[]>(() => firstPack.map(() => false));
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
  const [sellStage, setSellStage] = useState<"idle" | "confirm" | "selling">("idle");
  const [sold, setSold] = useState<{ dusted: number; value: number } | null>(null);
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
  // Sorted worst→best, so the chase card is the last one — and the room's
  // color is read off it, the same thing the sealed pack was already leaking.
  const bestRarity: RarityClass = count > 0 ? rarityOf(pack.pulls[count - 1].card.tier.key) : "common";
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
      const before = rarityRank(rarityOf(previous.card.tier.key));
      const after = rarityRank(rarityOf(pull.card.tier.key));
      if (after > before) return pull;
      if (after === before && pull.card.overall > previous.card.overall) return pull;
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
      const rarity = rarityOf(pull.card.tier.key);
      if (!mutedRef.current) flipTone(rarityRank(rarity));
      if (walkoutLabels(pull).length === 0) return;
      notePull(pull);
      // Queued rather than shown: "Flip all" can turn several qualifying
      // cards before the first takeover has been dismissed, and they're owed
      // one screen each, in flip order.
      if (!reducedRef.current) setWalkoutQueue((queue) => [...queue, index]);
    },
    [pack.pulls, notePull],
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
    walkoutSting(rarityOf(pull.card.tier.key), pull.signed);
  }, [activeWalkout, pack.pulls]);

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
    const pulls = [...result.cards].sort(byRarityAscending);
    const marked = markNew(pulls, pack.seen);
    const blank = pulls.map(() => false);
    flippedRef.current = blank;
    burstedRef.current = false;
    setPack({ index: pack.index + 1, pulls, isNew: marked.flags, seen: marked.seen });
    setFlipped(blank);
    setWalkoutQueue([]);
    setAutoFlip(false);
    setProgress(0);
    setBalance(result.balance);
    setSessionCount((n) => n + 1);
    setSellStage("idle");
    setSold(null);
    setSellError(null);
    setPhase("drop");
  }

  async function handleSellPack() {
    if (!onSellPack || sold) return;
    if (sellStage === "idle") {
      // Arm, don't fire: selling five cards you just paid for deserves a
      // deliberate second tap, not a misclick.
      setSellStage("confirm");
      setSellError(null);
      return;
    }
    if (sellStage !== "confirm") return;
    setSellStage("selling");
    const result = await onSellPack(pack.pulls.map((pull) => pull.inventoryId));
    if (!result.ok) {
      setSellStage("idle");
      setSellError(result.error);
      return;
    }
    setSold({ dusted: result.dusted, value: result.value });
    // Out of "selling" even on success — leaving it set would keep the
    // other summary buttons disabled for the rest of the pack.
    setSellStage("idle");
    setBalance(result.balance);
    setSellError(
      result.skipped > 0 ? `${result.skipped} card${result.skipped === 1 ? "" : "s"} couldn't be sold.` : null,
    );
  }

  const dustTotal = pack.pulls.reduce(
    (sum, pull) =>
      sum +
      dustValueOf({
        tier: pull.card.tier.key,
        foil: pull.foil,
        foilType: pull.foilType,
        signed: pull.signed,
        // Without the flags a pulled moment or champions relic would price
        // as the placeholder gold tier its wrapper carries — the sell-all
        // button then offers $10 for a $150 relic.
        moment: Boolean(pull.card.moment),
        champWin: Boolean(pull.card.champWin),
      }),
    0,
  );
  const newCount = pack.isNew.filter(Boolean).length;
  // The rays are the loudest thing on the stage, so they're spent sparingly:
  // a legendary-topped pack while it's still sealed, and any walkout.
  const showRays = (sealed && bestRarity === "legendary") || activeWalkout !== null;
  const vignette = sealed ? 0.16 + progress * 0.54 : view === "line" ? 0.22 : 0.14;

  const walkoutPull = activeWalkout !== null ? pack.pulls[activeWalkout] : null;

  return (
    <div
      className={`pack-overlay ${RARITY_GLOW[bestRarity]}`}
      role="dialog"
      aria-modal="true"
      aria-label="Opening a card pack"
    >
      <div className="pack-vignette" aria-hidden style={{ opacity: vignette }} />
      <div className="pack-spotlight" aria-hidden />
      {showRays ? <div className="pack-rays" aria-hidden /> : null}

      <div className="relative z-10 flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <span className="label-dash">
          Pack {sessionCount} · {fmtPoints(balance)}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMuted(!muted)}
            aria-pressed={muted}
            aria-label={muted ? "Unmute pack sounds" : "Mute pack sounds"}
            className="rounded-full border border-line px-3 py-1.5 text-sm text-steel transition-colors hover:border-coral hover:text-white"
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <button
            type="button"
            onClick={view === "summary" ? onExit : revealAll}
            className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-steel transition-colors hover:border-coral hover:text-white"
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
              // The wrapper knows what it holds: a Faceless Pack prints the
              // drop's markings instead of the five-cards-one-rare promise.
              champions={pack.pulls.some((pull) => Boolean(pull.card.champWin))}
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
                if (solo && index !== cursor) return null;
                const rarity = rarityOf(pull.card.tier.key);
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
                          <CardBack
                            rarity={rarity}
                            signed={pull.signed}
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
                              <PlayerCard3D
                                card={pull.card}
                                gyro={solo}
                                forceFoil={pull.foil}
                                foilType={pull.foilType}
                                flame={flame}
                              />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {face ? (
                      <div className="flex max-w-[13rem] flex-wrap items-center justify-center gap-1 text-center">
                        <span className="w-full truncate text-xs font-semibold text-white">{pull.card.name}</span>
                        {pack.isNew[index] ? (
                          <span className="rounded-full border border-mint bg-mint/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-mint">
                            New
                          </span>
                        ) : null}
                        {pull.signed ? (
                          <span
                            title="Autographed"
                            className="rounded-full border border-gold bg-gold/20 px-2 py-0.5 text-[9px] font-black text-gold"
                          >
                            ✍
                          </span>
                        ) : null}
                        {pull.foil ? (
                          <span
                            title="Foil"
                            className="rounded-full border border-gold/50 bg-gold/10 px-2 py-0.5 text-[9px] font-black text-gold"
                          >
                            ✦
                          </span>
                        ) : null}
                        {isAltArt(pull) ? (
                          <span
                            title="Alternate print"
                            className="rounded-full border border-cyan/50 bg-cyan/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-cyan"
                          >
                            Alt
                          </span>
                        ) : null}
                      </div>
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
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-steel">
                  {cursor + 1} / {count}
                </span>
                {cursor < count - 1 ? (
                  <button
                    type="button"
                    onClick={() => setCursor((c) => Math.min(c + 1, count - 1))}
                    disabled={!flipped[cursor]}
                    className="btn-pill px-5 py-2 text-sm disabled:opacity-40"
                  >
                    Next card →
                  </button>
                ) : null}
              </div>
            ) : null}

            <p className="relative mt-6 text-xs uppercase tracking-[0.22em] text-steel">
              {allFlipped ? "That's the pack" : "Tap a card to turn it over"}
            </p>
            {anyFlipped && !allFlipped ? (
              <button
                type="button"
                onClick={() => setAutoFlip(true)}
                className="relative mt-3 rounded-full border border-line px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-steel transition-colors hover:border-coral hover:text-white"
              >
                Flip all
              </button>
            ) : null}
          </>
        )}
      </div>

      {view === "summary" ? (
        <div className="pack-summary flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
          <div className="flex flex-col">
            <span className="label-dash">Pack value</span>
            <span className="text-lg font-bold text-gold">{fmtPoints(dustTotal)}</span>
          </div>
          <div className="flex flex-col">
            <span className="label-dash">New cards</span>
            <span className="text-lg font-bold text-white">
              {newCount} of {count}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="label-dash">Balance</span>
            <span className="text-lg font-bold text-white">{fmtPoints(balance)}</span>
          </div>
          <div className="flex flex-col">
            <span className="label-dash">This session</span>
            <span className="text-lg font-bold text-white">
              {sessionCount} {sessionCount === 1 ? "pack" : "packs"}
            </span>
          </div>
          {bestPull ? (
            <span className="rounded-full border border-gold/50 bg-gold/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-gold">
              ★ Best pull · {bestPull.card.name}
            </span>
          ) : null}

          <div className="ml-auto flex flex-wrap items-center gap-3">
            {error ? (
              <p role="alert" className="text-sm text-red-400">
                {error}
              </p>
            ) : null}
            {sellError ? (
              <p role="alert" className="text-sm text-red-400">
                {sellError}
              </p>
            ) : null}
            {onSellPack ? (
              sold ? (
                <span className="rounded-full border border-gold/50 bg-gold/10 px-4 py-2 text-sm font-semibold text-gold">
                  Sold {sold.dusted} for +{fmtPoints(sold.value)}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleSellPack()}
                  disabled={sellStage === "selling" || pending}
                  className="rounded-full border border-gold/60 bg-gold/10 px-5 py-2.5 text-sm font-semibold text-gold transition hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sellStage === "selling"
                    ? "Selling…"
                    : sellStage === "confirm"
                      ? `Sell all ${count} — sure?`
                      : `Sell pack — +${fmtPoints(dustTotal)}`}
                </button>
              )
            ) : null}
            <button
              type="button"
              onClick={handleOpenAnother}
              disabled={pending || error !== null || sellStage === "selling"}
              className="btn-coral px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Opening…" : `Open another — ${fmtPoints(packCost)}`}
            </button>
            <button
              type="button"
              onClick={onExit}
              className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-steel transition-colors hover:border-coral hover:text-white"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}

      {walkoutPull ? (
        <div
          className={`pack-walkout ${RARITY_GLOW[rarityOf(walkoutPull.card.tier.key)]}`}
          onClick={dismissWalkout}
          role="presentation"
        >
          <div className="pack-rays" aria-hidden style={{ opacity: 0.45 }} />
          {STORM_SPARKS.map((spark) => (
            <span
              key={spark.left + spark.top}
              aria-hidden
              className="pack-storm-spark"
              style={{ left: spark.left, top: spark.top, animationDelay: spark.delay }}
            >
              ✦
            </span>
          ))}
          <div className="relative flex flex-col items-center gap-1">
            {walkoutLabels(walkoutPull).map((label) => (
              <span key={label} className="pack-walkout-label">
                {label}
              </span>
            ))}
          </div>
          {/* Clicks inside the card belong to the card (it flips), not to the
              backdrop — the walkout is dismissed by its own button or by the
              space around it. */}
          <div className="pack-walkout-card" onClick={(event) => event.stopPropagation()} role="presentation">
            <PlayerCard3D card={walkoutPull.card} bloom gyro forceFoil={walkoutPull.foil} foilType={walkoutPull.foilType} flame={flame} />
          </div>
          <button
            type="button"
            autoFocus
            // Stopped, not bubbled: the backdrop dismisses too, and one click
            // reaching both handlers would eat the next queued walkout as
            // well as this one.
            onClick={(event) => {
              event.stopPropagation();
              dismissWalkout();
            }}
            className="btn-coral relative px-6 py-2.5 text-sm"
          >
            Continue
          </button>
        </div>
      ) : null}
    </div>
  );
}

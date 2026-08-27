"use client";

// The player card: a trading-card built from live season stats (see
// src/lib/cards/build.ts). Pointer (or gyroscope) tilt drives a CSS 3D
// rotation with a glare streak that follows the light; Emerald tier and up
// add a holographic foil layer whose intensity rides the hover, and the top
// tiers carry animated frames and halos (globals.css: card-glow-*,
// card-frame-*). The tilt is written to the DOM by hand rather than held in
// React state — the hub mounts 50+ of these and a re-render per mousemove is
// what made it crawl on weaker machines.
// Click flips to the back for the champion pool, season highs, badges, and
// form. `reveal` plays a face-down flip-up on mount — the share page's
// pack-opening moment. No WebGL — layered gradients and blend modes do it.

import { useCallback, useEffect, useRef, useState } from "react";
import CountUp from "@/components/home/CountUp";
import { championCenteredUrl, championIconUrl, championSplashUrl } from "@/lib/match-draft/champions";
import type { PlayerCardData } from "@/lib/cards/build";
import { FOIL_TYPE_LABELS, foilTypeOf, type FoilType } from "@/lib/packs/config";
import PatronFlame from "@/components/patron/PatronFlame";
import ChampionsCard from "./ChampionsCard";
import DrawLaurel from "./DrawLaurel";
import ExpeditionMark from "./ExpeditionMark";
import MomentPlate from "./MomentPlate";

/** Fixed sparkle placements (percent coords + stagger) for the top-tier
 *  glint layer — deterministic so SSR and client agree. */
const SPARKLES = [
  { left: "12%", top: "8%", delay: "0s", size: "text-sm" },
  { left: "82%", top: "14%", delay: "0.9s", size: "text-xs" },
  { left: "68%", top: "38%", delay: "1.7s", size: "text-base" },
  { left: "22%", top: "52%", delay: "0.4s", size: "text-xs" },
  { left: "88%", top: "64%", delay: "2.1s", size: "text-sm" },
  { left: "40%", top: "22%", delay: "1.3s", size: "text-xs" },
] as const;

/** Frame + accent styling per tier. `foil` turns on the holographic layer;
 *  `frameClass` replaces the static gradient with an animated one, and
 *  `glowClass` picks the breathing halo rendered behind the card. */
const TIER_STYLES: Record<
  PlayerCardData["tier"]["key"],
  { frame?: string; frameClass?: string; glowClass?: string; banner: string; ring: string; foil: boolean }
> = {
  bronze: { frame: "linear-gradient(160deg,#7c5334,#3e2a1a 45%,#8a5c38)", banner: "#b08d57", ring: "#b08d57", foil: false },
  silver: { frame: "linear-gradient(160deg,#9ba8b5,#4a5560 45%,#aab7c4)", banner: "#c0c9d2", ring: "#c0c9d2", foil: false },
  gold: { frame: "linear-gradient(160deg,#d4af37,#6b5518 45%,#e6c75a)", banner: "#e6c14b", ring: "#e6c14b", foil: false },
  platinum: { frame: "linear-gradient(160deg,#3ec6b5,#155e56 45%,#5cd6c6)", banner: "#4fd0bf", ring: "#4fd0bf", foil: false },
  emerald: { frame: "linear-gradient(160deg,#2ecc71,#0e5c31 45%,#58e08e)", banner: "#3fdc7f", ring: "#3fdc7f", foil: true },
  diamond: {
    frame: "linear-gradient(160deg,#6ec6ff,#1e4d75 45%,#9ad9ff)",
    glowClass: "card-glow-diamond",
    banner: "#8fd3ff",
    ring: "#8fd3ff",
    foil: true,
  },
  master: {
    frame: "linear-gradient(160deg,#b06ef0,#4a1e75 45%,#cf9aff)",
    glowClass: "card-glow-master",
    banner: "#c78fff",
    ring: "#c78fff",
    foil: true,
  },
  challenger: {
    frameClass: "card-frame-challenger",
    glowClass: "card-glow-challenger",
    banner: "#ffd166",
    ring: "#ffd166",
    foil: true,
  },
};

const MAX_TILT_DEG = 10;

/** Resting values for the two pointer-driven layers. They live in the JSX as
 *  constant strings so React writes them once at mount and never diffs them
 *  again — everything after that is written straight to the DOM below. */
const REST_TRANSFORM = "rotateX(0deg) rotateY(0deg)";
const REST_GLARE = "radial-gradient(circle at 50% 35%, rgb(255 255 255 / 0.5), transparent 55%)";
const REST_TRANSITION = "transform 250ms ease-out";
const TRACKING_TRANSITION = "transform 60ms linear";
/** A pulled foil's sheen at rest versus fully turned into the light. The
 *  span between them is the whole effect: see writeTilt. */
const FOIL_REST_OPACITY = 0.3;
const FOIL_PEAK_OPACITY = 0.85;
/** The flat sheen a TIER holo wears (Emerald+). Pinned rather than swung
 *  off the tilt: rebuilding a six-stop gradient per frame repainted the
 *  whole card face, and a pulled foil is what earns real motion now. */
const FOIL_GRADIENT =
  "linear-gradient(115deg, rgb(255 80 120 / 0.5) 0%, rgb(255 208 100 / 0.5) 20%, rgb(80 220 130 / 0.5) 40%, rgb(80 170 255 / 0.5) 60%, rgb(190 100 255 / 0.5) 80%, rgb(255 80 120 / 0.5) 100%)";

/** The light layer each parallel wears, and how it composites. Aurora
 *  screens rather than dodges — a wide soft gradient under color-dodge
 *  clips straight to white and stops being a curtain. */
const FOIL_LAYERS: Record<FoilType, { className: string; blend: "color-dodge" | "screen" }> = {
  prisma: { className: "card-foil-holo", blend: "color-dodge" },
  aurora: { className: "card-foil-aurora", blend: "screen" },
  refractor: { className: "card-foil-refractor", blend: "color-dodge" },
  ice: { className: "card-foil-ice", blend: "color-dodge" },
};

function PlayerCardFace({
  card,
  interactive = true,
  reveal = false,
  bloom = false,
  gyro = false,
  forceFoil = false,
  foilType,
  flame = null,
  className = "",
}: {
  card: PlayerCardData;
  /** false renders the static front only (grids, previews). */
  interactive?: boolean;
  /** Start face-down and flip up shortly after mount (share pages). */
  reveal?: boolean;
  /** Ambient tier-colored glow behind the card (share-page pedestal). */
  bloom?: boolean;
  /** Let the phone's gyroscope drive the tilt. Off by default and opt-in per
   *  surface, because the listener is on `window`: a grid of 50 cards each
   *  attached its own, so one global event tilted the whole gallery in
   *  unison at device refresh rate. Only surfaces showing ONE card — the
   *  share page, a pack reveal, a copy preview — should turn this on. */
  gyro?: boolean;
  /** Holograph the card whatever its tier — the pack economy's foil pull is
   *  a cosmetic rolled independently of rarity, so a foil Bronze exists. */
  forceFoil?: boolean;
  /** Which parallel this copy printed. Absent on a copy minted before
   *  parallels existed, which is a Prisma — exactly what it looked like
   *  then, and what it must keep looking like now. */
  foilType?: string | null;
  /** The owner's Patron Flame — rides the card's edge wherever a copy
   *  THEY OWN renders (collection, binder, pack reveal). Null everywhere
   *  else: on shared surfaces a flame would claim an owner the card does
   *  not have. A layer over the frame, never a frame swap — tier stays
   *  visible underneath, so money never reads as a rating. */
  flame?: string | null;
  className?: string;
}) {
  // `hovering` is the only pointer state React still owns — it flips twice per
  // hover (enter/leave) and only feeds the glare/foil opacity boost. The tilt
  // itself deliberately keeps no state at all; see writeTilt.
  const [hovering, setHovering] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [revealed, setRevealed] = useState(!reveal);
  // Stat bars sweep in from zero once mounted (after the reveal flip).
  const [statsIn, setStatsIn] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const glareRef = useRef<HTMLDivElement | null>(null);
  const holoRef = useRef<HTMLDivElement | null>(null);
  const cosmosRef = useRef<HTMLDivElement | null>(null);
  const foilRef = useRef<HTMLDivElement | null>(null);
  const artRef = useRef<HTMLImageElement | null>(null);
  // Latest pointer position, parked for the next animation frame.
  const pointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const rafRef = useRef(0);
  /** iOS only ever answers the permission prompt once; don't re-ask per tap. */
  const gyroAskedRef = useRef(false);
  /** Whether the gyroscope may be listened to. Only iOS gates this — it
   *  starts true elsewhere so Android keeps working with no prompt. */
  const [gyroAllowed, setGyroAllowed] = useState(
    () => typeof window === "undefined"
      || typeof (window.DeviceOrientationEvent as unknown as { requestPermission?: unknown } | undefined)
        ?.requestPermission !== "function",
  );
  const style = TIER_STYLES[card.tier.key];
  const parallel = foilTypeOf(foilType);
  const foilLayer = FOIL_LAYERS[parallel];
  // Card of the Week outshines its tier: molten-gold animated frame.
  const frameClass = card.standout ? "card-frame-standout" : style.frameClass;
  const frameStyle = frameClass ? undefined : style.frame;
  const glowClass = card.standout ? "card-glow-standout" : style.glowClass ?? "";
  // The art the front tries, best first. Riot's centered crop is the one the
  // frame is designed around, but it's missing for a lot of otherwise valid
  // skins — the uncropped splash of the same skin beats falling all the way
  // back to base art, so it sits in the middle. Deduped, so an artSkin of 0
  // doesn't retry the same url twice.
  const artChain = card.signature
    ? [...new Set(
        [
          championCenteredUrl(card.signature.champion, card.artSkin),
          championSplashUrl(card.signature.champion, card.artSkin),
          championCenteredUrl(card.signature.champion),
        ].filter((url): url is string => Boolean(url)),
      )]
    : [];
  const splash = artChain[0] ?? null;

  useEffect(() => {
    if (!reveal) return;
    const timer = setTimeout(() => setRevealed(true), 650);
    return () => clearTimeout(timer);
  }, [reveal]);

  useEffect(() => {
    const timer = setTimeout(() => setStatsIn(true), reveal ? 900 : 120);
    return () => clearTimeout(timer);
  }, [reveal]);

  // Tilt and glare are written straight to the DOM rather than held in state.
  // A setState per pointer move re-rendered the whole card — both faces, the
  // splash, every stat bar — dozens of times a second, and /cards keeps 50+ of
  // these mounted at once. Only the two nodes that actually move get touched.
  const writeTilt = useCallback((tiltX: number, tiltY: number, glareX: number, glareY: number) => {
    const frame = frameRef.current;
    if (frame) frame.style.transform = `rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
    const glare = glareRef.current;
    if (glare) {
      glare.style.background = `radial-gradient(circle at ${glareX}% ${glareY}%, rgb(255 255 255 / 0.5), transparent 55%)`;
    }
    // Pack foil: the wash slides as the card turns, and its strength rides
    // the pointer's distance from centre — bright when you tilt the card
    // into the light, near-invisible when you hold it square. Gating on
    // distance (rather than running the shine flat out whenever hovered) is
    // what keeps a wall of foils calm and makes the shine feel earned.
    const holo = holoRef.current;
    if (holo) holo.style.backgroundPosition = `${glareX * 1.6 - 30}% ${glareY * 1.6 - 30}%`;
    // The two star fields slide opposite ways at different rates — that
    // disagreement is what reads as depth rather than a printed pattern.
    const cosmos = cosmosRef.current;
    if (cosmos) {
      cosmos.style.backgroundPosition =
        `${glareX * 0.5}% ${glareY * 0.5}%, ${100 - glareX * 0.4}% ${100 - glareY * 0.4}%`;
    }
    // Parallax: the art drifts AGAINST the pointer, so it sits behind the
    // foil rather than under it. No tier holo moves the artwork, which is
    // exactly why this is the thing that sets a pulled foil apart.
    const art = artRef.current;
    if (art) {
      art.style.transform = `scale(1.12) translate(${(50 - glareX) * 0.1}%, ${(50 - glareY) * 0.1}%)`;
    }
    const foil = foilRef.current;
    if (foil) {
      const fromCentre = Math.min(1, Math.hypot(glareX - 50, glareY - 50) / 50);
      foil.style.opacity = String(FOIL_REST_OPACITY + fromCentre * (FOIL_PEAK_OPACITY - FOIL_REST_OPACITY));
    }
  }, []);

  /** Settle the foil and the artwork back to rest when the pointer leaves. */
  const releaseFoil = useCallback(() => {
    if (holoRef.current) holoRef.current.style.backgroundPosition = "";
    if (cosmosRef.current) cosmosRef.current.style.backgroundPosition = "";
    // Cleared, not zeroed: the resting scale lives on card-art-parallax.
    if (artRef.current) artRef.current.style.transform = "";
    if (foilRef.current) foilRef.current.style.opacity = String(FOIL_REST_OPACITY);
  }, []);

  // Pointer moves fire faster than the display refreshes, so the handler only
  // parks the coordinates and one queued frame does the single write — and it
  // measures the card inside that frame, so a burst of moves costs one layout
  // read instead of one per event.
  const scheduleTilt = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const frame = frameRef.current;
      const pointer = pointerRef.current;
      if (!frame || !pointer) return;
      const rect = frame.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const px = (pointer.clientX - rect.left) / rect.width;
      const py = (pointer.clientY - rect.top) / rect.height;
      writeTilt((0.5 - py) * MAX_TILT_DEG * 2, (px - 0.5) * MAX_TILT_DEG * 2, px * 100, py * 100);
    });
  }, [writeTilt]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  // Phones don't hover: the gyroscope drives the same tilt instead — and it's
  // every bit as chatty as a mouse, so it takes the same direct-write path.
  //
  // Opt-in via `gyro`. This listener lives on `window`, so every mounted card
  // used to receive every reading: a 50-card grid ran 50 handlers per frame
  // and tilted as one sheet, which reads as jank rather than as your card
  // responding to your hand.
  useEffect(() => {
    if (!gyro || !interactive || typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return;
    // On iOS the listener must be attached AFTER permission is granted —
    // one attached beforehand is not guaranteed to start firing. Everywhere
    // else there is nothing to ask, so `allowed` starts true.
    if (!gyroAllowed) return;
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) return;
      const x = Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, event.gamma / 3));
      const y = Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, (event.beta - 40) / 3));
      writeTilt(-y, x, 50 + x * 4, 35 + y * 4);
    };
    window.addEventListener("deviceorientation", onOrientation);
    return () => window.removeEventListener("deviceorientation", onOrientation);
  }, [gyro, gyroAllowed, interactive, writeTilt]);

  /**
   * iOS 13+ never delivers deviceorientation until it is asked, from inside a
   * user gesture. `"DeviceOrientationEvent" in window` is true on iPhone
   * regardless, so the old guard passed, the listener attached, and the tilt
   * silently did nothing on every iPhone. Asking on the first tap — the tap
   * that already flips the card — costs the user nothing extra.
   */
  const askForGyro = useCallback(() => {
    if (!gyro || typeof window === "undefined" || gyroAskedRef.current) return;
    const DOE = window.DeviceOrientationEvent as unknown as
      | { requestPermission?: () => Promise<PermissionState | string> }
      | undefined;
    if (typeof DOE?.requestPermission !== "function") return;
    gyroAskedRef.current = true;
    // CALLED ON THE CONSTRUCTOR, not as a detached reference: it is a static
    // method, and iOS throws "Illegal invocation" when `this` is lost — which
    // a bare `request()` did, silently, so the prompt never appeared.
    DOE.requestPermission()
      .then((state) => {
        // A refusal is a normal answer: the card keeps its tap/pointer
        // behaviour and simply never tilts.
        if (state === "granted") setGyroAllowed(true);
      })
      .catch(() => {});
  }, [gyro]);

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    pointerRef.current = { clientX: event.clientX, clientY: event.clientY };
    scheduleTilt();
  };

  const onPointerEnter = () => {
    if (!interactive) return;
    // The transition swaps imperatively alongside the transform: React owns
    // nothing on this layer once it's mounted, so a re-render can never stomp
    // a tilt mid-hover — and the snap-back below is guaranteed the slow ease.
    if (frameRef.current) frameRef.current.style.transition = TRACKING_TRANSITION;
    setHovering(true);
  };

  const reset = () => {
    if (!interactive) return;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    pointerRef.current = null;
    if (frameRef.current) frameRef.current.style.transition = REST_TRANSITION;
    writeTilt(0, 0, 50, 35);
    releaseFoil();
    setHovering(false);
  };

  const statTone = (value: number) =>
    value >= 80 ? "#3fdc7f" : value >= 60 ? style.banner : value >= 40 ? "#e8865a" : "#e05c6e";

  const face = "absolute inset-0 flex flex-col overflow-hidden rounded-2xl [backface-visibility:hidden]";
  const showBack = flipped || !revealed;

  return (
    <div className={`relative [perspective:1100px] ${className}`} style={{ width: "20rem" }}>
      {bloom ? (
        // Pedestal glow: a soft tier-colored bloom the card floats on.
        <div
          aria-hidden
          className="absolute -inset-10 -z-10 rounded-full opacity-45 blur-3xl"
          style={{ background: `radial-gradient(ellipse at center, ${style.ring}, transparent 70%)` }}
        />
      ) : null}
      {glowClass ? (
        // Tier halo. A blurred colour field behind the card whose *opacity*
        // pulses (globals.css: cardGlowPulse) — the compositor animates that on
        // the GPU. The box-shadow it replaces repainted every glowing card on
        // every frame, and the hub can have a dozen of them breathing at once.
        <div aria-hidden className={`pointer-events-none absolute inset-2 -z-10 rounded-2xl blur-lg ${glowClass}`} />
      ) : null}
      {/* Tilt (fast, follows the pointer) and flip (slow, on click or on
          reveal) live on separate layers so both stay smooth. */}
      <div
        ref={frameRef}
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={`${card.name} player card — ${card.overall} overall, ${card.tier.label}${forceFoil ? `, ${FOIL_TYPE_LABELS[parallel]} foil` : ""}.${interactive ? " Activate to flip." : ""}`}
        onPointerMove={onPointerMove}
        onPointerEnter={onPointerEnter}
        onPointerLeave={reset}
        onClick={interactive ? () => { askForGyro(); setFlipped((f) => !f); } : undefined}
        onKeyDown={
          interactive ? (e) => (e.key === "Enter" || e.key === " ") && setFlipped((f) => !f) : undefined
        }
        className={`relative aspect-[5/7] w-full select-none rounded-2xl [transform-style:preserve-3d] ${
          interactive ? "cursor-pointer" : ""
        }`}
        // Constant strings on purpose: React sets them at mount and, since they
        // never change between renders, never writes them again — leaving the
        // pointer handlers free to own this node's transform outright.
        style={{ transform: REST_TRANSFORM, transition: REST_TRANSITION }}
      >
      <div
        className="relative h-full w-full rounded-2xl [transform-style:preserve-3d]"
        style={{
          transform: `rotateY(${showBack ? 180 : 0}deg)`,
          transition: reveal && !flipped ? "transform 850ms cubic-bezier(0.2,0.8,0.3,1)" : "transform 450ms ease",
        }}
      >
        {/* ── FRONT ────────────────────────────────────────────────── */}
        <div className={`${face} ${frameClass ?? ""}`} style={{ background: frameStyle, padding: "5px" }}>
          <div className="relative flex h-full w-full flex-col overflow-hidden rounded-xl bg-navy">
            {splash ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                // Remount when the art changes so the stage counter below,
                // which lives on the DOM node, restarts at the top of the chain.
                key={splash}
                ref={artRef}
                src={splash}
                alt=""
                className={`absolute inset-0 h-full w-full object-cover object-[center_18%] ${
                  forceFoil ? "card-art-parallax" : ""
                }`}
                loading="lazy"
                // Decoding off the main thread: a wall of splash art otherwise
                // blocks the frame it lands in, which is felt as scroll jank.
                decoding="async"
                onError={(event) => {
                  // Walk the chain one step per failure — centered(skin) →
                  // splash(skin) → base art — and stop at its end rather than
                  // looping a broken url forever. The index rides the element,
                  // not React state: this handler must not re-render the card.
                  const img = event.currentTarget;
                  const next = Number(img.dataset.artStage ?? "0") + 1;
                  if (next >= artChain.length) return;
                  img.dataset.artStage = String(next);
                  img.src = artChain[next];
                }}
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/20 to-black/85" />
            {card.teamImageUrl ? (
              // Team watermark, ghosted behind the stat block.
              // Not greyscaled, and lifted off 15% opacity: a dark crest
              // (a black-background badge, say) desaturated to 15% over
              // dark splash art has almost no luminance left and reads as
              // no logo at all, while pale ones still showed — which looks
              // exactly like a broken lookup for that one team. Keeping the
              // brand colour plus a soft light halo gives dark marks an
              // edge to separate on, without the watermark competing with
              // the art.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.teamImageUrl}
                alt=""
                className="pointer-events-none absolute bottom-24 right-2 h-24 w-24 object-contain opacity-30 saturate-50 drop-shadow-[0_0_3px_rgba(255,255,255,0.45)]"
                loading="lazy"
                decoding="async"
              />
            ) : null}
            {/* Tier banner */}
            <div className="relative flex items-center justify-between px-4 pt-3">
              <span
                className="rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-navy"
                style={{ background: card.standout ? "#f5b62e" : style.banner }}
              >
                {card.tier.label}
              </span>
              {/* Which parallel, said out loud. A ladder nobody can see is
                  not a ladder — half the point of pulling a Cracked Ice is
                  knowing you did. Prisma stays unlabelled: it is the base,
                  every foil before parallels was one, and badging it would
                  make ordinary foils look like a new thing. */}
              {forceFoil && parallel !== "prisma" ? (
                <span
                  className="rounded-full border border-white/45 bg-navy/70 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-white"
                  title={`${FOIL_TYPE_LABELS[parallel]} parallel`}
                >
                  {FOIL_TYPE_LABELS[parallel]}
                </span>
              ) : null}
              {/* Provenance stamps: how this copy entered the world. Frozen
                  into the card json at mint, so they survive trades. */}
              {card.live ? (
                <span
                  data-testid="live-stamp"
                  className="rounded-full border border-red-400/60 bg-red-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-red-300"
                  title={`Opened live — ${card.live.label}`}
                >
                  ● Live
                </span>
              ) : null}
              {card.chase ? (
                <span
                  data-testid="chase-stamp"
                  className="rounded-full border border-gold/70 bg-gold/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-gold"
                  title={`First to the chase: ${card.chase.title}`}
                >
                  ★ Chase
                </span>
              ) : null}
              <div className="flex flex-col items-end gap-0.5">
                <div
                  className="flex h-14 w-14 flex-col items-center justify-center rounded-full border-2 bg-navy/85 text-center"
                  style={{ borderColor: style.ring }}
                >
                  <CountUp value={card.overall} className="text-xl font-black leading-none text-white" />
                  <span className="text-[8px] font-bold uppercase tracking-widest text-steel">OVR</span>
                </div>
                {card.serial > 0 ? (
                  <span className="font-mono text-[9px] font-bold text-white/70 [text-shadow:0_1px_2px_rgb(0_0_0/0.9)]">
                    #{String(card.serial).padStart(3, "0")}/{card.collectionSize}
                  </span>
                ) : null}
              </div>
            </div>
            {card.standout ? (
              <div className="relative mt-1 flex justify-center">
                <span className="rounded-full border border-gold/70 bg-black/70 px-3 py-0.5 text-[10px] font-black uppercase tracking-[0.22em] text-gold [text-shadow:0_0_10px_rgb(245_182_46/0.8)]">
                  ★ {card.role} of the Week ★
                </span>
              </div>
            ) : null}
            {card.autograph ? (
              <div className="relative mt-1 flex justify-center">
                <span className="rounded-full border border-gold/70 bg-black/70 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.22em] text-gold">
                  ✍ Signed
                </span>
              </div>
            ) : null}

            {/* Identity */}
            <div className="relative mt-1 px-4" data-testid="card-identity">
              <h3 className="font-display text-3xl font-bold not-italic text-white [text-shadow:0_2px_6px_rgb(0_0_0/0.9)]">{card.name}</h3>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/80 [text-shadow:0_1px_3px_rgb(0_0_0/0.9)]">
                {card.role}
                {/* Abbreviation, not the full name: the signature is anchored
                    over the right half of this band, and a long name ran
                    straight underneath it. Falls back to the name for copies
                    frozen before abbreviations were carried on the card. */}
                {card.teamName ? ` · ${card.teamAbbr ?? card.teamName}` : ""}
              </p>
            </div>

            {/* Archetype + stats anchored to the bottom */}
            <div className="relative mt-auto flex flex-col gap-2 px-4 pb-3">
              {card.autograph ? (
                // The pen mark itself — anchored to this block so it always
                // hovers right above the archetype label, at the angle a
                // hand signs at. White ink, so it needs a dark halo of its
                // own to read over a bright splash.
                // Right-anchored rather than centered: the name/team lines
                // above are left-aligned, and a centered signature ran
                // straight through the team name.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={card.autograph}
                  alt={`${card.name}'s autograph`}
                  data-testid="autograph"
                  decoding="async"
                  className="pointer-events-none absolute -top-[3.75rem] right-2 w-[50%] object-contain"
                  style={{
                    transform: "rotate(-6deg)",
                    filter: "drop-shadow(0 1px 3px rgb(0 0 0 / 0.95)) drop-shadow(0 0 8px rgb(255 255 255 / 0.35))",
                  }}
                />
              ) : null}
              <div className="rounded-lg bg-black/65 px-3 py-1.5 text-center backdrop-blur-[2px]">
                <span className="font-display text-base font-bold not-italic text-white">{card.archetype}</span>
              </div>
              {card.signature ? (
                <div className="flex items-baseline justify-between">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/60">Signature</span>
                  <span className="text-sm font-bold text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.9)]">
                    {card.signature.champion}
                    <span className="ml-1.5 text-[9px] font-semibold uppercase text-white/60">{card.signature.games} GP</span>
                  </span>
                </div>
              ) : null}
              <div className="flex flex-col gap-1.5">
                {card.subStats.map((stat) => (
                  <div key={stat.key} className="flex items-center gap-2">
                    {/* Sized for the longest label the engine can print
                        ("OBJECTIVES" runs ~68px at 9px + 0.14em tracking,
                        past the old w-16), with truncate as the backstop so
                        any future label clips on one line instead of
                        wrapping and shoving the bar track out of line. The
                        track stays flex-1, so the extra 4px comes out of it
                        rather than out of the card. */}
                    <span className="w-[4.75rem] shrink-0 truncate whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.14em] text-white/75">
                      {stat.label}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
                      {/* Bars sweep in from zero on mount — the stat reveal. */}
                      <div
                        className="h-full rounded-full transition-[width] duration-700 ease-out"
                        style={{ width: `${statsIn ? stat.value : 0}%`, background: statTone(stat.value) }}
                      />
                    </div>
                    <CountUp value={stat.value} className="w-6 text-right font-mono text-[11px] font-bold text-white" />
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-white/15 pt-2 text-[11px] font-bold text-white/85">
                <span>
                  {card.wins}–{card.losses} · {Math.round(card.winratePct)}% WR
                </span>
                {card.pentas > 0 ? <span style={{ color: style.banner }}>PENTA ×{card.pentas}</span> : null}
                <span>LVL {card.level}</span>
              </div>
            </div>

            {/* Glare follows the pointer; foil on Emerald+, or on request. */}
            {interactive ? (
              <div
                ref={glareRef}
                aria-hidden
                className="pointer-events-none absolute inset-0 transition-opacity duration-200"
                style={{ opacity: hovering ? 0.55 : 0.18, background: REST_GLARE, mixBlendMode: "overlay" }}
              />
            ) : null}
            {forceFoil ? (
              // A pulled foil answers the pointer where a tier holo cannot:
              // a rainbow wash plus a sparse cosmos star field, both sliding
              // from the same rAF as the tilt and brightening with distance
              // from centre — and, above, the artwork itself drifting behind
              // them. Tier holos stay a flat film laid on top.
              <div
                ref={foilRef}
                aria-hidden
                data-testid="foil"
                className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl transition-opacity duration-300"
                style={{ opacity: FOIL_REST_OPACITY }}
              >
                <div ref={holoRef} className={foilLayer.className} style={{ mixBlendMode: foilLayer.blend }} />
                <div ref={cosmosRef} className="card-foil-cosmos" style={{ mixBlendMode: "screen" }} />
              </div>
            ) : style.foil || card.standout ? (
              <div
                aria-hidden
                data-testid="foil"
                className="pointer-events-none absolute inset-0"
                style={{ opacity: hovering ? 0.5 : 0.22, background: FOIL_GRADIENT, mixBlendMode: "color-dodge" }}
              />
            ) : null}
            {card.tier.key === "challenger" || card.standout ? (
              // Drifting glints — the top of the collection literally sparkles.
              <div aria-hidden data-testid="sparkles" className="pointer-events-none absolute inset-0">
                {SPARKLES.map((sparkle, index) => (
                  <span
                    key={index}
                    className={`card-sparkle ${sparkle.size}`}
                    style={{ left: sparkle.left, top: sparkle.top, animationDelay: sparkle.delay }}
                  >
                    ✦
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* ── BACK ─────────────────────────────────────────────────── */}
        <div className={`${face} [transform:rotateY(180deg)] ${frameClass ?? ""}`} style={{ background: frameStyle, padding: "5px" }}>
          <div className="flex h-full w-full flex-col gap-2 overflow-hidden rounded-xl bg-navy p-4">
            <div className="flex items-center justify-between">
              <span className="rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-navy" style={{ background: style.banner }}>
                {card.tier.label}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-steel">Season {card.season}</span>
            </div>
            <h3 className="font-display text-2xl font-bold not-italic text-white">{card.name}</h3>
            {card.motto ? (
              <p className="-mt-1 truncate text-xs italic text-steel">&ldquo;{card.motto}&rdquo;</p>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-steel">Champion pool</span>
              {card.topChampions.length === 0 ? (
                <p className="text-xs text-steel">No games on record yet.</p>
              ) : (
                card.topChampions.map((champ) => {
                  const icon = championIconUrl(champ.champion);
                  const wr = Math.round((champ.wins / champ.games) * 100);
                  return (
                    <div key={champ.champion} className="flex items-center gap-2">
                      {icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={icon}
                          alt=""
                          className="h-7 w-7 rounded border border-line object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <span className="h-7 w-7 rounded border border-dashed border-line" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{champ.champion}</span>
                      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-white/15">
                        <div className="h-full rounded-full" style={{ width: `${wr}%`, background: statTone(wr) }} />
                      </div>
                      <span className="w-16 text-right font-mono text-[10px] text-steel">
                        {champ.games}G · {wr}%
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {card.highlights.length > 0 ? (
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-steel">Season highs</span>
                {card.highlights.map((highlight) => (
                  <div key={highlight.label} className="flex items-baseline gap-2 text-[11px]">
                    <span className="text-steel">{highlight.label}</span>
                    <span className="font-mono font-bold text-white">{highlight.value}</span>
                    {highlight.detail ? <span className="min-w-0 flex-1 truncate text-right text-[10px] text-steel">{highlight.detail}</span> : null}
                  </div>
                ))}
              </div>
            ) : null}

            {card.badges.length > 0 ? (
              <div className="flex flex-wrap gap-1" aria-label="Badges">
                {card.badges.map((badge) => (
                  <span
                    key={badge.key}
                    title={badge.detail}
                    className="rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                    style={{ borderColor: style.ring, color: style.banner }}
                  >
                    {badge.label}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-steel">Last five</span>
              <div className="flex gap-1.5" aria-label="Recent form, oldest first">
                {card.form.length === 0 ? (
                  <span className="text-xs text-steel">—</span>
                ) : (
                  card.form.map((won, index) => (
                    <span
                      key={index}
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black ${
                        won ? "bg-mint/25 text-mint" : "bg-red-500/25 text-red-400"
                      }`}
                    >
                      {won ? "W" : "L"}
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="mt-auto flex items-center justify-between border-t border-line pt-2 text-[11px] font-bold text-steel">
              <span>
                {card.wins}–{card.losses} · {Math.round(card.winratePct)}% WR
              </span>
              <span>LVL {card.level}</span>
            </div>
          </div>
        </div>

        {/* The Patron Flame orbits 6px OUTSIDE the card, so it cannot live
            inside a face — both faces clip at overflow-hidden, and a ring
            entirely beyond the clip box simply vanishes (it did). Out here
            on the tilt layer nothing clips: it turns with the card, and
            deliberately does not flip — the halo holds while the card
            shows its back, like a hand holding it up. */}
        {flame ? <PatronFlame flame={flame} /> : null}
      </div>
      {/* Weekly Draw provenance. On the tilt layer rather than inside a
          face, for the flame's reasons: it turns with the card and holds
          while the card shows its back, instead of flipping into a mirror
          image of itself.
          Top-left, not the bottom-left the other two renderers use — a
          player card's front is a stat rail from roughly its midpoint
          down, and the laurel sat straight on top of the bar labels. This
          pocket, under the tier pill and left of the OVR ring, is the one
          the front keeps empty (the standout and Signed pills are
          centered). */}
      {card.drawWin ? <DrawLaurel weekStart={card.drawWin.weekStart} position="left-[6%] top-[10%]" /> : null}
      {/* Expedition provenance, on the tilt layer for the laurel's
          reasons. The right edge at a third of the way down is the one
          strip a player card front leaves empty top to bottom: below
          the OVR ring and its serial, above the autograph and the team
          watermark, and right of a left-aligned name. Bottom-right,
          which the other two renderers can use, is the stat rail here.
          The laurel is top-LEFT on this face, so the two never meet. */}
      {card.expedition ? (
        <ExpeditionMark mark={card.expedition.mark} date={card.expedition.date} position="right-[6%] top-[33%]" />
      ) : null}
      </div>
    </div>
  );
}

/** The champions relic's foil at rest — matches the fixed opacity
 *  ChampionsCard renders with, so the release writes back what React set. */
const CHAMP_FOIL_REST = 0.5;
const CHAMP_FOIL_PEAK = 0.85;

/**
 * The tilt rig around a ChampionsCard — the same pointer treatment a
 * player card gets, wrapped around the server-renderable relic instead of
 * rebuilt inside it. ChampionsCard stays hook-free (the admin preview
 * renders it directly, static); this wrapper owns the rotation, a soft
 * glare, and driving the relic's own foil layers by hand, direct DOM
 * writes and one rAF per frame, exactly like PlayerCardFace's writeTilt.
 */
function ChampionsCard3D({
  card,
  interactive,
  foil,
  foilType,
  flame,
  className = "",
}: {
  card: PlayerCardData;
  interactive: boolean;
  foil: boolean;
  foilType: string | null;
  flame: string | null;
  className?: string;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const glareRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef(0);
  const pointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const [hovering, setHovering] = useState(false);

  const writeTilt = useCallback((tiltX: number, tiltY: number, glareX: number, glareY: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    frame.style.transform = `rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
    const glare = glareRef.current;
    if (glare) {
      // Quieter than a player card's glare — white light on black felt
      // reads twice as loud.
      glare.style.background = `radial-gradient(circle at ${glareX}% ${glareY}%, rgb(255 255 255 / 0.22), transparent 55%)`;
    }
    // The relic's own foil layers, driven from outside: the parallel layer
    // chases the light and the whole sheet brightens as the card turns,
    // same numbers as a player card's pulled foil.
    const foilWrap = frame.querySelector<HTMLElement>('[data-testid="champ-foil"]');
    if (foilWrap) {
      const layer = foilWrap.querySelector<HTMLElement>(":scope > div:first-child");
      if (layer) layer.style.backgroundPosition = `${glareX * 1.6 - 30}% ${glareY * 1.6 - 30}%`;
      const cosmos = foilWrap.querySelector<HTMLElement>(".card-foil-cosmos");
      if (cosmos) {
        cosmos.style.backgroundPosition = `${glareX * 0.5}% ${glareY * 0.5}%, ${100 - glareX * 0.4}% ${100 - glareY * 0.4}%`;
      }
      const fromCentre = Math.min(1, Math.hypot(glareX - 50, glareY - 50) / 50);
      foilWrap.style.opacity = String(CHAMP_FOIL_REST + fromCentre * (CHAMP_FOIL_PEAK - CHAMP_FOIL_REST));
    }
  }, []);

  const scheduleTilt = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const frame = frameRef.current;
      const pointer = pointerRef.current;
      if (!frame || !pointer) return;
      const rect = frame.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const px = (pointer.clientX - rect.left) / rect.width;
      const py = (pointer.clientY - rect.top) / rect.height;
      writeTilt((0.5 - py) * MAX_TILT_DEG * 2, (px - 0.5) * MAX_TILT_DEG * 2, px * 100, py * 100);
    });
  }, [writeTilt]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const reset = () => {
    if (!interactive) return;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    pointerRef.current = null;
    const frame = frameRef.current;
    if (frame) {
      frame.style.transition = REST_TRANSITION;
      const foilWrap = frame.querySelector<HTMLElement>('[data-testid="champ-foil"]');
      if (foilWrap) {
        foilWrap.style.opacity = String(CHAMP_FOIL_REST);
        const layer = foilWrap.querySelector<HTMLElement>(":scope > div:first-child");
        if (layer) layer.style.backgroundPosition = "";
        const cosmos = foilWrap.querySelector<HTMLElement>(".card-foil-cosmos");
        if (cosmos) cosmos.style.backgroundPosition = "";
      }
    }
    writeTilt(0, 0, 50, 35);
    setHovering(false);
  };

  return (
    <div className={`relative [perspective:1100px] ${className}`} style={{ width: "20rem" }}>
      <div
        ref={frameRef}
        style={{ transform: REST_TRANSFORM }}
        onPointerEnter={() => {
          if (!interactive) return;
          if (frameRef.current) frameRef.current.style.transition = TRACKING_TRANSITION;
          setHovering(true);
        }}
        onPointerMove={(event) => {
          if (!interactive) return;
          pointerRef.current = { clientX: event.clientX, clientY: event.clientY };
          scheduleTilt();
        }}
        onPointerLeave={reset}
        onPointerCancel={reset}
        className="relative"
      >
        <ChampionsCard card={card} foil={foil} foilType={foilType} signed={Boolean(card.autograph)} />
        <div
          ref={glareRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-xl transition-opacity duration-200"
          style={{ background: REST_GLARE, opacity: hovering ? 1 : 0, mixBlendMode: "soft-light" }}
        />
        {flame ? <PatronFlame flame={flame} radius="0.75rem" /> : null}
      </div>
    </div>
  );
}

export default function PlayerCard3D(props: {
  card: PlayerCardData;
  interactive?: boolean;
  reveal?: boolean;
  bloom?: boolean;
  /** See PlayerCardFace: opt-in gyroscope tilt, for single-card surfaces. */
  gyro?: boolean;
  forceFoil?: boolean;
  foilType?: string | null;
  flame?: string | null;
  className?: string;
}) {
  // A pulled moment is stored as a card copy so the shelf, trades, dust,
  // the binder and the pack reveal all carry it without changes — but it is
  // not a player card and must never be drawn as one. Branching in a
  // wrapper rather than at each call site is what makes that true
  // everywhere at once; it has to be a wrapper rather than an early return
  // because PlayerCardFace's hooks cannot run conditionally.
  // A champions-drop card is a relic, not a rating — same wrapper-branch
  // reasoning as moments below, same 20rem shell as everything.
  if (props.card.champWin) {
    return (
      <ChampionsCard3D
        card={props.card}
        interactive={props.interactive !== false}
        foil={props.forceFoil === true}
        foilType={props.foilType ?? null}
        flame={props.flame ?? null}
        className={props.className}
      />
    );
  }
  const { moment } = props.card;
  if (moment) {
    return (
      // The SAME 20rem shell PlayerCardFace wraps itself in, className and
      // all. The plate alone is width-less (w-full), so in a content-sized
      // flex cell it had no intrinsic width and took its size from its
      // caption; in a fractional grid column it overfilled. Matching the
      // player card's shell is what makes the two agree in every container
      // at once, instead of per-callsite luck.
      <div className={`relative ${props.className ?? ""}`} style={{ width: "20rem" }}>
        <MomentPlate
          moment={{
            id: moment.id,
            weekStart: moment.weekStart,
            slug: moment.playerSlug,
            summonerName: moment.summonerName,
            teamName: moment.teamName,
            champion: moment.champion,
            role: null,
            triggerKey: moment.triggerKey ?? "",
            title: moment.title,
            headline: moment.headline,
            gameDate: null,
            opponent: moment.opponent ?? null,
            durationMin: moment.durationMin ?? null,
          }}
          copySerial={moment.copySerial ?? null}
          season={props.card.season}
        />
        {props.flame ? (
          // Moments in a patron's collection burn too — the flame marks the
          // OWNER, and a moment copy is as owned as any player card.
          <PatronFlame flame={props.flame} radius="0.75rem" />
        ) : null}
        {/* Rendered here rather than inside MomentPlate: the plate takes a
            LeagueMoment, not the copy's card json, and the draw win belongs
            to the copy. Same 20rem shell, so bottom-left lands on the plate
            exactly where it lands on a relic — below its centered footer
            stack. */}
        {props.card.drawWin ? <DrawLaurel weekStart={props.card.drawWin.weekStart} /> : null}
        {/* Same shell, and the plate's bottom-right is as clear as its
            bottom-left (the footer stack is centered), so the mark takes
            the default pocket opposite the laurel. rounded-xl, not the
            player card's rounded-2xl: the ember frame has to follow the
            plate's own corner. */}
        {props.card.expedition ? (
          <ExpeditionMark
            mark={props.card.expedition.mark}
            date={props.card.expedition.date}
            frame="inset-0 rounded-xl"
          />
        ) : null}
      </div>
    );
  }
  return <PlayerCardFace {...props} />;
}

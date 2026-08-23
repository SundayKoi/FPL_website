"use client";

// The player card: a trading-card built from live season stats (see
// src/lib/cards/build.ts). Pointer (or gyroscope) tilt drives a CSS 3D
// rotation with a glare streak that follows the light; Emerald tier and up
// add a holographic foil layer whose intensity rides the tilt, and the top
// tiers carry animated frames (globals.css: card-glow-*, card-frame-*).
// Click flips to the back for the champion pool, season highs, badges, and
// form. `reveal` plays a face-down flip-up on mount — the share page's
// pack-opening moment. No WebGL — layered gradients and blend modes do it.

import { useEffect, useRef, useState } from "react";
import { championCenteredUrl, championIconUrl } from "@/lib/match-draft/champions";
import type { PlayerCardData } from "@/lib/cards/build";

/** Frame + accent styling per tier. `foil` turns on the holographic layer;
 *  `frameClass` replaces the static gradient with an animated one, and
 *  `glowClass` adds the breathing box-shadow. */
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
  challenger: { frameClass: "card-frame-challenger", banner: "#ffd166", ring: "#ffd166", foil: true },
};

const MAX_TILT_DEG = 10;

export default function PlayerCard3D({
  card,
  interactive = true,
  reveal = false,
  className = "",
}: {
  card: PlayerCardData;
  /** false renders the static front only (grids, previews). */
  interactive?: boolean;
  /** Start face-down and flip up shortly after mount (share pages). */
  reveal?: boolean;
  className?: string;
}) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [glare, setGlare] = useState({ x: 50, y: 35 });
  const [hovering, setHovering] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [revealed, setRevealed] = useState(!reveal);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const style = TIER_STYLES[card.tier.key];
  // Card of the Week outshines its tier: molten-gold animated frame.
  const frameClass = card.standout ? "card-frame-standout" : style.frameClass;
  const frameStyle = frameClass ? undefined : style.frame;
  const glowClass = card.standout ? "" : style.glowClass ?? "";
  const splash = card.signature ? championCenteredUrl(card.signature.champion, card.artSkin) : null;
  const baseSplash = card.signature ? championCenteredUrl(card.signature.champion) : null;

  useEffect(() => {
    if (!reveal) return;
    const timer = setTimeout(() => setRevealed(true), 650);
    return () => clearTimeout(timer);
  }, [reveal]);

  // Phones don't hover: the gyroscope drives the same tilt instead.
  useEffect(() => {
    if (!interactive || typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return;
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) return;
      const x = Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, event.gamma / 3));
      const y = Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, (event.beta - 40) / 3));
      setTilt({ x: -y, y: x });
      setGlare({ x: 50 + x * 4, y: 35 + y * 4 });
    };
    window.addEventListener("deviceorientation", onOrientation);
    return () => window.removeEventListener("deviceorientation", onOrientation);
  }, [interactive]);

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || !frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    setTilt({ x: (0.5 - py) * MAX_TILT_DEG * 2, y: (px - 0.5) * MAX_TILT_DEG * 2 });
    setGlare({ x: px * 100, y: py * 100 });
    setHovering(true);
  };

  const reset = () => {
    setTilt({ x: 0, y: 0 });
    setGlare({ x: 50, y: 35 });
    setHovering(false);
  };

  const statTone = (value: number) =>
    value >= 80 ? "#3fdc7f" : value >= 60 ? style.banner : value >= 40 ? "#e8865a" : "#e05c6e";

  const face = "absolute inset-0 flex flex-col overflow-hidden rounded-2xl [backface-visibility:hidden]";
  const showBack = flipped || !revealed;

  return (
    <div className={`[perspective:1100px] ${className}`} style={{ width: "20rem" }}>
      {/* Tilt (fast, follows the pointer) and flip (slow, on click or on
          reveal) live on separate layers so both stay smooth. */}
      <div
        ref={frameRef}
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={`${card.name} player card — ${card.overall} overall, ${card.tier.label}.${interactive ? " Activate to flip." : ""}`}
        onPointerMove={onPointerMove}
        onPointerLeave={reset}
        onClick={interactive ? () => setFlipped((f) => !f) : undefined}
        onKeyDown={interactive ? (e) => (e.key === "Enter" || e.key === " ") && setFlipped((f) => !f) : undefined}
        className={`relative aspect-[5/7] w-full select-none rounded-2xl [transform-style:preserve-3d] ${
          interactive ? "cursor-pointer" : ""
        }`}
        style={{
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transition: hovering ? "transform 60ms linear" : "transform 250ms ease-out",
        }}
      >
      <div
        className={`relative h-full w-full rounded-2xl [transform-style:preserve-3d] ${glowClass}`}
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
                src={splash}
                alt=""
                className="absolute inset-0 h-full w-full object-cover object-[center_18%]"
                loading="lazy"
                onError={(event) => {
                  // A skin number with no centered art on the CDN falls back
                  // to the base splash rather than a broken card.
                  if (baseSplash && event.currentTarget.src !== baseSplash) event.currentTarget.src = baseSplash;
                }}
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/20 to-black/85" />
            {card.teamImageUrl ? (
              // Team watermark, ghosted behind the stat block.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.teamImageUrl}
                alt=""
                className="pointer-events-none absolute bottom-24 right-2 h-24 w-24 object-contain opacity-15 grayscale"
                loading="lazy"
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
              <div
                className="flex h-14 w-14 flex-col items-center justify-center rounded-full border-2 bg-navy/85 text-center"
                style={{ borderColor: style.ring }}
              >
                <span className="text-xl font-black leading-none text-white">{card.overall}</span>
                <span className="text-[8px] font-bold uppercase tracking-widest text-steel">OVR</span>
              </div>
            </div>
            {card.standout ? (
              <div className="relative mt-1 flex justify-center">
                <span className="rounded-full border border-gold/70 bg-black/70 px-3 py-0.5 text-[10px] font-black uppercase tracking-[0.22em] text-gold [text-shadow:0_0_10px_rgb(245_182_46/0.8)]">
                  ★ Card of the Week ★
                </span>
              </div>
            ) : null}

            {/* Identity */}
            <div className="relative mt-1 px-4">
              <h3 className="font-display text-3xl font-bold not-italic text-white [text-shadow:0_2px_6px_rgb(0_0_0/0.9)]">{card.name}</h3>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/80 [text-shadow:0_1px_3px_rgb(0_0_0/0.9)]">
                {card.role}
                {card.teamName ? ` · ${card.teamName}` : ""}
              </p>
            </div>

            {/* Archetype + stats anchored to the bottom */}
            <div className="relative mt-auto flex flex-col gap-2 px-4 pb-3">
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
                    <span className="w-16 text-[9px] font-bold uppercase tracking-[0.14em] text-white/75">{stat.label}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
                      <div className="h-full rounded-full" style={{ width: `${stat.value}%`, background: statTone(stat.value) }} />
                    </div>
                    <span className="w-6 text-right font-mono text-[11px] font-bold text-white">{stat.value}</span>
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

            {/* Glare follows the pointer; foil only on Emerald+. */}
            {interactive ? (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 transition-opacity duration-200"
                style={{
                  opacity: hovering ? 0.55 : 0.18,
                  background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgb(255 255 255 / 0.5), transparent 55%)`,
                  mixBlendMode: "overlay",
                }}
              />
            ) : null}
            {style.foil || card.standout ? (
              <div
                aria-hidden
                data-testid="foil"
                className="pointer-events-none absolute inset-0"
                style={{
                  opacity: hovering ? 0.5 : 0.22,
                  background: `linear-gradient(${115 + tilt.y * 4}deg, rgb(255 80 120 / 0.5) 0%, rgb(255 208 100 / 0.5) 20%, rgb(80 220 130 / 0.5) 40%, rgb(80 170 255 / 0.5) 60%, rgb(190 100 255 / 0.5) 80%, rgb(255 80 120 / 0.5) 100%)`,
                  mixBlendMode: "color-dodge",
                }}
              />
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
                        <img src={icon} alt="" className="h-7 w-7 rounded border border-line object-cover" loading="lazy" />
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
      </div>
      </div>
    </div>
  );
}

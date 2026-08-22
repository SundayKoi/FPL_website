"use client";

// The player card: a trading-card built from live season stats (see
// src/lib/cards/build.ts). Pointer (or gyroscope) tilt drives a CSS 3D
// rotation with a glare streak that follows the light; Emerald tier and up
// add a holographic foil layer whose intensity rides the tilt. Click flips
// to the back for the champion pool and recent form. No WebGL — layered
// gradients and blend modes do all of it.

import { useEffect, useRef, useState } from "react";
import { championCenteredUrl, championIconUrl } from "@/lib/match-draft/champions";
import type { PlayerCardData } from "@/lib/cards/build";

/** Frame + accent styling per tier. `foil` turns on the holographic layer. */
const TIER_STYLES: Record<
  PlayerCardData["tier"]["key"],
  { frame: string; banner: string; ring: string; foil: boolean }
> = {
  bronze: { frame: "linear-gradient(160deg,#7c5334,#3e2a1a 45%,#8a5c38)", banner: "#b08d57", ring: "#b08d57", foil: false },
  silver: { frame: "linear-gradient(160deg,#9ba8b5,#4a5560 45%,#aab7c4)", banner: "#c0c9d2", ring: "#c0c9d2", foil: false },
  gold: { frame: "linear-gradient(160deg,#d4af37,#6b5518 45%,#e6c75a)", banner: "#e6c14b", ring: "#e6c14b", foil: false },
  platinum: { frame: "linear-gradient(160deg,#3ec6b5,#155e56 45%,#5cd6c6)", banner: "#4fd0bf", ring: "#4fd0bf", foil: false },
  emerald: { frame: "linear-gradient(160deg,#2ecc71,#0e5c31 45%,#58e08e)", banner: "#3fdc7f", ring: "#3fdc7f", foil: true },
  diamond: { frame: "linear-gradient(160deg,#6ec6ff,#1e4d75 45%,#9ad9ff)", banner: "#8fd3ff", ring: "#8fd3ff", foil: true },
  master: { frame: "linear-gradient(160deg,#b06ef0,#4a1e75 45%,#cf9aff)", banner: "#c78fff", ring: "#c78fff", foil: true },
  challenger: { frame: "linear-gradient(160deg,#ffd166,#f0637a 35%,#5cc8ff 70%,#ffd166)", banner: "#ffd166", ring: "#ffd166", foil: true },
};

const MAX_TILT_DEG = 10;

export default function PlayerCard3D({
  card,
  interactive = true,
  className = "",
}: {
  card: PlayerCardData;
  /** false renders the static front only (grids, previews). */
  interactive?: boolean;
  className?: string;
}) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [glare, setGlare] = useState({ x: 50, y: 35 });
  const [hovering, setHovering] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const style = TIER_STYLES[card.tier.key];
  const splash = card.signature ? championCenteredUrl(card.signature.champion) : null;

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

  return (
    <div className={`[perspective:1100px] ${className}`} style={{ width: "20rem" }}>
      {/* Tilt (fast, follows the pointer) and flip (slow, on click) live on
          separate layers so clicking mid-hover still flips smoothly. */}
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
        className="relative h-full w-full rounded-2xl [transform-style:preserve-3d]"
        style={{ transform: `rotateY(${flipped ? 180 : 0}deg)`, transition: "transform 450ms ease" }}
      >
        {/* ── FRONT ────────────────────────────────────────────────── */}
        <div className={face} style={{ background: style.frame, padding: "5px" }}>
          <div className="relative flex h-full w-full flex-col overflow-hidden rounded-xl bg-navy">
            {splash ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={splash} alt="" className="absolute inset-0 h-full w-full object-cover object-[center_18%]" loading="lazy" />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/20 to-black/85" />

            {/* Tier banner */}
            <div className="relative flex items-center justify-between px-4 pt-3">
              <span
                className="rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-navy"
                style={{ background: style.banner }}
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
            {style.foil ? (
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
        <div className={`${face} [transform:rotateY(180deg)]`} style={{ background: style.frame, padding: "5px" }}>
          <div className="flex h-full w-full flex-col gap-3 overflow-hidden rounded-xl bg-navy p-4">
            <div className="flex items-center justify-between">
              <span className="rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-navy" style={{ background: style.banner }}>
                {card.tier.label}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-steel">Season {card.season}</span>
            </div>
            <h3 className="font-display text-2xl font-bold not-italic text-white">{card.name}</h3>

            <div className="flex flex-col gap-2">
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
                        <img src={icon} alt="" className="h-8 w-8 rounded border border-line object-cover" loading="lazy" />
                      ) : (
                        <span className="h-8 w-8 rounded border border-dashed border-line" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{champ.champion}</span>
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/15">
                        <div className="h-full rounded-full" style={{ width: `${wr}%`, background: statTone(wr) }} />
                      </div>
                      <span className="w-16 text-right font-mono text-[11px] text-steel">
                        {champ.games}G · {wr}%
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-steel">Last five</span>
              <div className="flex gap-1.5" aria-label="Recent form, oldest first">
                {card.form.length === 0 ? (
                  <span className="text-xs text-steel">—</span>
                ) : (
                  card.form.map((won, index) => (
                    <span
                      key={index}
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black ${
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

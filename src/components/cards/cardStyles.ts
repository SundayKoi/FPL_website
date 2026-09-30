// The card renderers' shared look: the frame and accent each tier wears,
// and the light layer each foil parallel composites. A plain module of
// constants (no "use client", no runtime imports) because the
// server-rendered relic and roster plate (ChampionsCard, TeamCard) wear the
// same layers as the client-side PlayerCard3D. Class names stay full
// literals so Tailwind emits every one.

import type { PlayerCardData } from "@/lib/cards/build";
import type { FoilType } from "@/lib/packs/config";

/** One foil parallel's light layer, and how it composites. */
export interface FoilLayer {
  className: string;
  blend: "color-dodge" | "screen";
}

/** The light layer each parallel wears, and how it composites. Aurora
 *  screens rather than dodges — a wide soft gradient under color-dodge
 *  clips straight to white and stops being a curtain. */
export const FOIL_LAYERS: Record<FoilType, FoilLayer> = {
  prisma: { className: "card-foil-holo", blend: "color-dodge" },
  aurora: { className: "card-foil-aurora", blend: "screen" },
  refractor: { className: "card-foil-refractor", blend: "color-dodge" },
  ice: { className: "card-foil-ice", blend: "color-dodge" },
  // Eclipse rides its own GROUND layers as well (the drain and the
  // corona, rendered outside the tilt-swung wrapper). This entry is the
  // bead of gold that moves with the pointer.
  eclipse: { className: "card-foil-eclipse", blend: "screen" },
};

/** Frame + accent styling per tier. `foil` turns on the holographic layer;
 *  `frameClass` replaces the static gradient with an animated one, and
 *  `glowClass` picks the breathing halo rendered behind the card. */
export const TIER_STYLES: Record<
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

/** The flat sheen a TIER holo wears (Emerald+). Pinned rather than swung
 *  off the tilt: rebuilding a six-stop gradient per frame repainted the
 *  whole card face, and a pulled foil is what earns real motion now. */
export const FOIL_GRADIENT =
  "linear-gradient(115deg, rgb(255 80 120 / 0.5) 0%, rgb(255 208 100 / 0.5) 20%, rgb(80 220 130 / 0.5) 40%, rgb(80 170 255 / 0.5) 60%, rgb(190 100 255 / 0.5) 80%, rgb(255 80 120 / 0.5) 100%)";

/** Fixed sparkle placements (percent coords + stagger) for the top-tier
 *  glint layer — deterministic so SSR and client agree. */
export const SPARKLES = [
  { left: "12%", top: "8%", delay: "0s", size: "text-sm" },
  { left: "82%", top: "14%", delay: "0.9s", size: "text-xs" },
  { left: "68%", top: "38%", delay: "1.7s", size: "text-base" },
  { left: "22%", top: "52%", delay: "0.4s", size: "text-xs" },
  { left: "88%", top: "64%", delay: "2.1s", size: "text-sm" },
  { left: "40%", top: "22%", delay: "1.3s", size: "text-xs" },
] as const;

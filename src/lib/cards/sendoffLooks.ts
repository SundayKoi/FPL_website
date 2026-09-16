// PROPOSAL. Six looks for the Send-off print, as mockups on /admin/sendoff
// and nowhere else, through PlayerCard3D's `overlay` prop — the road every
// overlay proposal takes (src/lib/cards/overlayMockups.ts,
// src/lib/cards/dribbMockups.ts). Nothing here mints, and no minted copy
// can reach these layers. When the league picks one it becomes the
// treatment `card.sendoff` turns on, and this file becomes its source.
//
// Why they are six OBJECTS and not six tints: the tier frames are shifting
// metal, Card of the Week is molten gold, Eclipse is leaf over obsidian,
// the skin lines are PROJECT/Harrowing/Academy/Arcade/Arcana/K-DA/Battlecast
// and Dribb is a star field, a kintsugi and an oil slick. A playoff
// keepsake has to be recognisable at a glance as something ELSE: a
// newspaper, a plaque, a banner in the rafters, a stage, a blueprint, a
// photograph in a drawer.
//
// How the stage reaches the CSS. A layer is a bare <div> with a class on
// it, so its text can only be static and its ladder can only be a custom
// property. Two shared families in globals.css carry the stage in:
//
//   card-ov-so-word-<stage>   the stamp word, as ::before content
//   card-ov-so-rung-<stage>   --so-fill (how far up the ladder, 0–100%)
//                             and --so-crown (1 on the Champion, else 0)
//
// Both are set on the SAME element as the look's own layer class, which is
// why a `front` entry can hold more than one class name. The metal of the
// ladder — pewter, bronze, silver, gold — arrives as `--ov-accent` from
// the stage's `accent`, which is the shipped stamp's own colour
// (SENDOFF_META), so the mockups and the ribbon agree.
//
// Every class name is spelled out in full: Tailwind only emits a utility
// it can read verbatim in source, and a name built at runtime is one it
// cannot.

import type { OverlayPreview } from "@/components/cards/PlayerCard3D";
import { EXIT_LABELS, SENDOFF_META, type SendoffMark, type SendoffStage } from "./sendoff";

export interface SendoffLook {
  key: string;
  title: string;
  /** What it looks like, one line. */
  blurb: string;
  /** What it feels like to hold, one line — the reason to pick it. */
  feel: string;
  /** How the five stages differ inside the look, one line. */
  ladder: string;
  accent: string;
  front: string[];
  back?: string[];
  artEcho?: string;
  /** Stage-specific additions: extra front layers, a different echo, a
   *  different accent. The Champion always differs. */
  byStage?: Partial<Record<SendoffStage, { front?: string[]; artEcho?: string; accent?: string }>>;
}

/** The chip line: "SEMIFINALIST · 1–3 · SEMIFINALS". The one place a look
 *  can print something the CSS cannot know — the series, and which round
 *  ended the split. */
export function sendoffLookChip(mark: SendoffMark): string {
  return `${SENDOFF_META[mark.stage].stamp} · ${mark.series ?? "—"} · ${EXIT_LABELS[mark.exit].toUpperCase()}`;
}

/** The overlay for one card in one look — the base layers plus the
 *  stage's, the stage's echo and accent when it has one. */
export function sendoffLookOverlay(look: SendoffLook, mark: SendoffMark): OverlayPreview {
  const stage = look.byStage?.[mark.stage];
  const artEcho = stage?.artEcho ?? look.artEcho;
  const overlay: OverlayPreview = {
    front: [...look.front, ...(stage?.front ?? [])],
    chip: sendoffLookChip(mark),
    accent: stage?.accent ?? look.accent,
  };
  if (artEcho) overlay.artEcho = artEcho;
  if (look.back?.length) overlay.back = [...look.back];
  return overlay;
}

/** The ladder's metals, straight off the shipped stamp so a mockup can
 *  never drift from the ribbon it is drawn under. */
const PEWTER = SENDOFF_META.gauntlet.accent;
const BRONZE = SENDOFF_META.quarterfinalist.accent;
const SILVER = SENDOFF_META.semifinalist.accent;
const GOLD = SENDOFF_META.finalist.accent;
const CROWN_GOLD = SENDOFF_META.champion.accent;

export const SENDOFF_LOOKS: SendoffLook[] = [
  {
    key: "newsprint",
    title: "Newsprint",
    blurb:
      "The match-day programme. A cream page gutter, THE SEND-OFF across a masthead in condensed black type under a black rule and a red one, the art ruled off as a photo block and screened into ink dots, and a perforated ticket stub punched along the foot.",
    feel:
      "Paper. Something that was printed the morning after and kept — the one card in the collection that is not made of light.",
    ladder:
      "The rubber stamp's ink runs the ladder: grey, bronze, silver, gold. The Champion's masthead prints in gold-foil ink and the photograph is hand-tinted back toward colour.",
    accent: "#c0392b",
    front: [
      "card-ov-so-newsprint",
      "card-ov-so-newsprint-screen",
      "card-ov-so-newsprint-masthead",
      "card-ov-so-newsprint-stub",
    ],
    artEcho: "card-ov-so-newsprint-echo",
    byStage: {
      gauntlet: { front: ["card-ov-so-newsprint-stamp card-ov-so-word-gauntlet"], accent: PEWTER },
      quarterfinalist: { front: ["card-ov-so-newsprint-stamp card-ov-so-word-quarterfinalist"], accent: BRONZE },
      semifinalist: { front: ["card-ov-so-newsprint-stamp card-ov-so-word-semifinalist"], accent: SILVER },
      finalist: { front: ["card-ov-so-newsprint-stamp card-ov-so-word-finalist"], accent: GOLD },
      champion: {
        front: ["card-ov-so-newsprint-stamp card-ov-so-word-champion", "card-ov-so-newsprint-foil"],
        artEcho: "card-ov-so-newsprint-echo-tint",
        accent: CROWN_GOLD,
      },
    },
  },
  {
    key: "plaque",
    title: "The Plaque",
    blurb:
      "The hall-of-fame wall. Dark walnut with the grain running through it, four brass screws in the corners, the card sunk behind a bevelled window, and an engraved nameplate across the foot.",
    feel:
      "Heavy and matte. Nothing moves, nothing shines — it is the one card that was mounted rather than printed, and it is meant to hang.",
    ladder:
      "The nameplate's metal runs pewter, bronze, silver, gold. The Champion's plate is gold with a laurel engraved either side of the word.",
    accent: "#b08d57",
    front: ["card-ov-so-plaque", "card-ov-so-plaque-bevel", "card-ov-so-plaque-screws"],
    artEcho: "card-ov-so-plaque-echo",
    byStage: {
      gauntlet: { front: ["card-ov-so-plaque-plate card-ov-so-word-gauntlet"], accent: PEWTER },
      quarterfinalist: { front: ["card-ov-so-plaque-plate card-ov-so-word-quarterfinalist"], accent: BRONZE },
      semifinalist: { front: ["card-ov-so-plaque-plate card-ov-so-word-semifinalist"], accent: SILVER },
      finalist: { front: ["card-ov-so-plaque-plate card-ov-so-word-finalist"], accent: GOLD },
      champion: {
        front: ["card-ov-so-plaque-plate card-ov-so-word-champion", "card-ov-so-plaque-laurel"],
        accent: CROWN_GOLD,
      },
    },
  },
  {
    key: "rafters",
    title: "Rafters",
    blurb:
      "The banner in the arena roof. A swallow-tailed felt pennant hangs off a steel truss at the left with the stage stitched across it, in the dark of a gym ceiling with one warm floodlight falling from above.",
    feel:
      "It is not a card of a player, it is the thing the building keeps after the player leaves. You look up at it.",
    ladder:
      "The pennant's trim and fringe run grey, bronze, silver, gold. The Champion hangs two banners, overlapping, in a scatter of confetti frozen mid-fall.",
    accent: "#c0c9d2",
    front: ["card-ov-so-rafters", "card-ov-so-rafters-light", "card-ov-so-rafters-hang"],
    byStage: {
      gauntlet: { front: ["card-ov-so-rafters-banner card-ov-so-word-gauntlet"], accent: PEWTER },
      quarterfinalist: { front: ["card-ov-so-rafters-banner card-ov-so-word-quarterfinalist"], accent: BRONZE },
      semifinalist: { front: ["card-ov-so-rafters-banner card-ov-so-word-semifinalist"], accent: SILVER },
      finalist: { front: ["card-ov-so-rafters-banner card-ov-so-word-finalist"], accent: GOLD },
      champion: {
        front: [
          "card-ov-so-rafters-second",
          "card-ov-so-rafters-banner card-ov-so-word-champion",
          "card-ov-so-rafters-confetti",
        ],
        accent: CROWN_GOLD,
      },
    },
  },
  {
    key: "curtain",
    title: "Curtain Call",
    blurb:
      "The last bow. Black-and-white under a single warm spotlight from the wings, crimson theatre curtains gathered in at both edges, and a marquee bar across the foot whose bulbs light up as far as the team got.",
    feel:
      "The house lights are up and one lamp is still on you. It is an ending with an audience, which is what a playoff exit is.",
    ladder:
      "The marquee lights one bulb further each round. The Champion's spotlight turns gold and the curtains draw back to the edges of the stage.",
    accent: "#ffe3a6",
    front: ["card-ov-so-curtain"],
    artEcho: "card-ov-so-curtain-echo",
    byStage: {
      gauntlet: {
        front: [
          "card-ov-so-curtain-drape card-ov-so-rung-gauntlet",
          "card-ov-so-curtain-spot",
          "card-ov-so-curtain-marquee card-ov-so-rung-gauntlet card-ov-so-word-gauntlet",
        ],
        accent: PEWTER,
      },
      quarterfinalist: {
        front: [
          "card-ov-so-curtain-drape card-ov-so-rung-quarterfinalist",
          "card-ov-so-curtain-spot",
          "card-ov-so-curtain-marquee card-ov-so-rung-quarterfinalist card-ov-so-word-quarterfinalist",
        ],
        accent: BRONZE,
      },
      semifinalist: {
        front: [
          "card-ov-so-curtain-drape card-ov-so-rung-semifinalist",
          "card-ov-so-curtain-spot",
          "card-ov-so-curtain-marquee card-ov-so-rung-semifinalist card-ov-so-word-semifinalist",
        ],
        accent: SILVER,
      },
      finalist: {
        front: [
          "card-ov-so-curtain-drape card-ov-so-rung-finalist",
          "card-ov-so-curtain-spot",
          "card-ov-so-curtain-marquee card-ov-so-rung-finalist card-ov-so-word-finalist",
        ],
        accent: GOLD,
      },
      champion: {
        front: [
          "card-ov-so-curtain-drape card-ov-so-rung-champion",
          "card-ov-so-curtain-spot",
          "card-ov-so-curtain-marquee card-ov-so-rung-champion card-ov-so-word-champion",
        ],
        accent: CROWN_GOLD,
      },
    },
  },
  {
    key: "bracket",
    title: "The Bracket",
    blurb:
      "The blueprint of the run. Navy under a fine cyan grid, the whole bracket drawn in thin line-art behind a cyanotype of the art, the team's own path lit along it, annotated in monospace.",
    feel:
      "A working drawing rather than a trophy: this is exactly how far the line went before it stopped, and you can trace it with a finger.",
    ladder:
      "The lit path runs one round further at every stage. The Champion's path reaches the trophy node at the end of the bracket and turns gold.",
    accent: "#7fd8ff",
    front: ["card-ov-so-bracket", "card-ov-so-bracket-tree"],
    artEcho: "card-ov-so-bracket-echo",
    byStage: {
      gauntlet: {
        front: ["card-ov-so-bracket-path card-ov-so-rung-gauntlet", "card-ov-so-bracket-note card-ov-so-word-gauntlet"],
        accent: "#7fd8ff",
      },
      quarterfinalist: {
        front: [
          "card-ov-so-bracket-path card-ov-so-rung-quarterfinalist",
          "card-ov-so-bracket-note card-ov-so-word-quarterfinalist",
        ],
        accent: "#7fd8ff",
      },
      semifinalist: {
        front: [
          "card-ov-so-bracket-path card-ov-so-rung-semifinalist",
          "card-ov-so-bracket-note card-ov-so-word-semifinalist",
        ],
        accent: "#9fe4ff",
      },
      finalist: {
        front: ["card-ov-so-bracket-path card-ov-so-rung-finalist", "card-ov-so-bracket-note card-ov-so-word-finalist"],
        accent: "#c8f2ff",
      },
      champion: {
        front: [
          "card-ov-so-bracket-path card-ov-so-rung-champion",
          "card-ov-so-bracket-crown",
          "card-ov-so-bracket-note card-ov-so-word-champion",
        ],
        accent: CROWN_GOLD,
      },
    },
  },
  {
    key: "yearbook",
    title: "Yearbook",
    blurb:
      "The photograph in the drawer. A faded sepia print inside a scalloped cream border, held down by four black photo-corner mounts, with a light leak across one corner and the stage written by hand along the foot.",
    feel:
      "Somebody's keepsake, not a product. It reads as a season that is already over — which, for the person holding it, it is.",
    ladder:
      "The handwritten caption, and the ink it is written in, change with the stage. The Champion's photograph is hand-tinted back to colour and one mount is gold leaf.",
    accent: "#8a7550",
    front: ["card-ov-so-yearbook", "card-ov-so-yearbook-leak", "card-ov-so-yearbook-corners"],
    artEcho: "card-ov-so-yearbook-echo",
    byStage: {
      gauntlet: { front: ["card-ov-so-yearbook-caption card-ov-so-word-gauntlet"], accent: PEWTER },
      quarterfinalist: { front: ["card-ov-so-yearbook-caption card-ov-so-word-quarterfinalist"], accent: BRONZE },
      semifinalist: { front: ["card-ov-so-yearbook-caption card-ov-so-word-semifinalist"], accent: SILVER },
      finalist: { front: ["card-ov-so-yearbook-caption card-ov-so-word-finalist"], accent: GOLD },
      champion: {
        front: ["card-ov-so-yearbook-caption card-ov-so-word-champion", "card-ov-so-yearbook-gold"],
        artEcho: "card-ov-so-yearbook-echo-color",
        accent: CROWN_GOLD,
      },
    },
  },
];

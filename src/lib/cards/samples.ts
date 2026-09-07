// The rarities page's specimen: one made-up card, worn every way a card can
// come out of a pack, so a reader sees each rarity on the same face instead
// of guessing from prose.
//
// Dribb is not a player. The card is built here, never minted, never
// queried: nothing on the page depends on who topped this week, and the
// samples look identical in every league and every week. Every rarity is a
// frozen field on the copy (src/lib/cards/build.ts), so a sample is just
// the base card with that field set — the renderer does the rest, exactly
// as it does for a real pull.

import type { PlayerCardData } from "@/lib/cards/build";
import type { TeamPrint } from "@/lib/cards/teamCards";
import type { FoilType } from "@/lib/packs/config";

/** A fixed Monday, so the plates and stamps print the same week forever. */
export const SAMPLE_WEEK = "2026-01-05";
const SAMPLE_AT = "2026-01-05T12:00:00.000Z";

/** The autograph a signed sample wears — an SVG "Dribb" in a script face,
 *  as a data URI, the same shape a real signature is stored in (an image
 *  URI the front prints and the ink-write animation sweeps). */
export const SAMPLE_AUTOGRAPH =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 90">' +
      '<text x="8" y="62" font-family="Brush Script MT, Segoe Script, cursive" font-size="58" font-style="italic" fill="#111">Dribb</text>' +
      '<path d="M14 72 C 70 84, 150 60, 226 74" fill="none" stroke="#111" stroke-width="2.5" stroke-linecap="round"/>' +
      "</svg>",
  );

/** The base: Dribb, a 99 in every column, on Bard, on no team. */
export function sampleCard(): PlayerCardData {
  return {
    slug: "dribb-na1",
    name: "Dribb",
    tag: "NA1",
    teamName: null,
    teamImageUrl: null,
    teamAbbr: null,
    role: "Mid",
    overall: 99,
    tier: { key: "challenger", label: "Challenger" },
    archetype: "The Wanderer",
    signature: { champion: "Bard", games: 99 },
    artSkin: 0,
    motto: "Every chime is a pull.",
    serial: 1,
    collectionSize: 99,
    topChampions: [{ champion: "Bard", games: 99, wins: 99 }],
    form: [true, true, true, true, true],
    subStats: [
      { key: "combat", label: "Combat", value: 99 },
      { key: "economy", label: "Economy", value: 99 },
      { key: "vision", label: "Vision", value: 99 },
      { key: "objectives", label: "Objectives", value: 99 },
      { key: "impact", label: "Impact", value: 99 },
    ],
    highlights: [{ label: "Most kills", value: "99", detail: "Bard vs everyone" }],
    badges: [{ key: "penta", label: "Pentakiller", detail: "99 pentakills this season" }],
    standout: false,
    wins: 99,
    losses: 0,
    winratePct: 100,
    level: 99,
    pentas: 99,
    season: "S5",
  };
}

export interface RaritySample {
  card: PlayerCardData;
  /** Passed straight to PlayerCard3D as forceFoil / foilType. */
  foil: boolean;
  foilType: FoilType | null;
}

const TIER_OF_CLASS: Record<string, PlayerCardData["tier"]> = {
  common: { key: "gold", label: "Gold" },
  rare: { key: "emerald", label: "Emerald" },
  epic: { key: "diamond", label: "Diamond" },
  legendary: { key: "challenger", label: "Challenger" },
};

const PARALLELS: FoilType[] = ["prisma", "aurora", "refractor", "ice", "eclipse"];

function teamPrint(): TeamPrint {
  const base = sampleCard();
  return {
    teamName: "Dribb",
    imageUrl: null,
    monogram: "DR",
    abbr: "DRB",
    bannerColor: "#f5b62e",
    overall: 99,
    tierKey: "challenger",
    tierLabel: "Challenger",
    slots: (["Top", "Jungle", "Mid", "Bot", "Support"] as const).map((role) => ({
      role,
      name: base.name,
      slug: base.slug,
      overall: 99,
      champion: "Bard",
      standout: false,
      autograph: null,
    })),
    weekStart: SAMPLE_WEEK,
    copySerial: 1,
  };
}

/**
 * The specimen for one entry of the rarity guide (src/lib/cards/rarityGuide.ts),
 * keyed the way the guide keys it. Null for a key the guide does not have,
 * so a new entry without a sample fails a test rather than a page.
 */
export function sampleFor(key: string): RaritySample | null {
  const base = sampleCard();
  const plain = (card: PlayerCardData): RaritySample => ({ card, foil: false, foilType: null });

  if (key in TIER_OF_CLASS) return plain({ ...base, tier: TIER_OF_CLASS[key] });
  if ((PARALLELS as string[]).includes(key)) {
    // Only a Card of the Week can go Eclipse, and the frame reads that flag.
    return { card: key === "eclipse" ? { ...base, standout: true } : base, foil: true, foilType: key as FoilType };
  }

  switch (key) {
    case "shiny":
      return plain({ ...base, shiny: true });
    case "stattrak":
      return plain({ ...base, stattrak: { points: 999, since: SAMPLE_AT } });
    case "secret":
      return plain({ ...base, secret: { number: base.collectionSize + 1, of: base.collectionSize } });
    case "signed":
      return plain({ ...base, autograph: SAMPLE_AUTOGRAPH });
    case "alt":
      return plain({ ...base, artSkin: 1 });
    case "moment":
      return plain({
        ...base,
        moment: {
          id: 0,
          title: "Pentakill",
          headline: "Dribb chimed five times and the whole team went home.",
          summonerName: "Dribb",
          champion: "Bard",
          teamName: null,
          weekStart: SAMPLE_WEEK,
          playerSlug: base.slug,
          triggerKey: "pentakill",
          opponent: "Everyone",
          durationMin: 27,
          copySerial: 1,
        },
      });
    case "plate":
      return plain({ ...base, team: teamPrint() });
    case "relic":
      return plain({
        ...base,
        champWin: { rank: "A", setIndex: 1, setSize: 14, team: "Dribb", seasonWon: "S4", champion: "Bard", joker: false, copySerial: 1 },
      });
    case "live":
      return plain({ ...base, live: { label: "Rarities Night" } });
    case "chase":
      return plain({ ...base, chase: { title: "A 99 on Bard" } });
    case "draw":
      return plain({ ...base, drawWin: { weekStart: SAMPLE_WEEK } });
    case "mark":
      return plain({ ...base, expedition: { mark: "sigil", tier: "raid", date: SAMPLE_AT } });
    case "mutation":
      return plain({ ...base, mutation: { key: "irradiated", date: SAMPLE_AT, run: 0 } });
    case "echo":
      return plain({ ...base, echo: { run: 0, moment: 0, date: SAMPLE_AT } });
    case "wear":
      return plain({ ...base, wear: 14 });
    case "slab":
      return plain({ ...base, wear: 2, slab: { wear: 2, at: SAMPLE_AT } });
    default:
      return null;
  }
}

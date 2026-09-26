// Which job a champion does, for the style-aware card rating (see
// src/lib/cards/styleRating.ts).
//
// A card used to judge every mid on a mage's job: damage and damage share
// carried ~23% of a mid's score and kills ~4.5%, so an assassin who won their
// games the way assassins win them rated like a mage who played badly. The
// style rating instead grades each GAME by what its champion is for, and it
// needs this table to know what that is.
//
// Loosely Riot's own class system, collapsed to the distinctions that change
// a stat line:
//
//   tank        vanguards and wardens — engage, peel, soak damage
//   bruiser     juggernauts and divers — fight on the front line AND deal damage
//   skirmisher  duelists — side lanes, solo kills, split pressure
//   assassin    burst and picks — kills, roams, solo kills
//   mage        burst, battle and artillery mages — damage and control
//   marksman    ADCs — sustained damage and turrets
//   enchanter   heal / shield supports
//
// Data Dragon publishes class TAGS too, but they are too coarse to use
// directly (every tank support is "Tank, Support", Nilah is a "Fighter" who
// plays bot) — which is why this is curated, like CHAMPION_ROLES. A champion
// missing from this table fails playstyle.test.ts: an unclassified champion
// would be graded against the wrong history rather than none.

import { championDisplayName } from "@/lib/match-draft/champions";

export type ChampionClass = "tank" | "bruiser" | "skirmisher" | "assassin" | "mage" | "marksman" | "enchanter";

/**
 * The job one game is graded on — a class, read in the context of the role
 * it was played in. Karma mid is a mage and Karma support an enchanter;
 * Leona support is "engage" rather than "tank" because a support's frontline
 * is graded against other supports' frontlines, not a top laner's.
 */
export type Playstyle =
  | "tank"
  | "engage"
  | "bruiser"
  | "skirmisher"
  | "fighter"
  | "assassin"
  | "carry"
  | "mage"
  | "marksman"
  | "ranged"
  | "enchanter"
  | "other";

const CLASSES: Record<ChampionClass, string[]> = {
  tank: [
    "Alistar", "Amumu", "Bard", "Blitzcrank", "Braum", "Cho'Gath", "Galio", "Gragas", "K'Sante", "Leona",
    "Malphite", "Maokai", "Nautilus", "Nunu & Willump", "Ornn", "Poppy", "Pyke", "Rakan", "Rammus", "Rell",
    "Sejuani", "Shen", "Singed", "Sion", "Skarner", "Tahm Kench", "Taric", "Thresh", "Zac",
  ],
  bruiser: [
    "Aatrox", "Ambessa", "Briar", "Camille", "Darius", "Dr. Mundo", "Garen", "Gnar", "Hecarim", "Illaoi",
    "Jarvan IV", "Kled", "Lee Sin", "Mordekaiser", "Nasus", "Olaf", "Pantheon", "Rek'Sai", "Renekton", "Sett",
    "Shyvana", "Trundle", "Udyr", "Urgot", "Vi", "Volibear", "Warwick", "Wukong", "Xin Zhao", "Yorick",
    // Zaahen: no Riot class to go on at the time of writing; plays top and
    // jungle and his league games read as a juggernaut (heavy damage taken,
    // mitigation and healing alongside real damage).
    "Zaahen",
  ],
  skirmisher: [
    "Bel'Veth", "Fiora", "Gwen", "Irelia", "Jax", "Master Yi", "Riven", "Sylas", "Tryndamere", "Viego",
    "Yasuo", "Yone",
  ],
  assassin: [
    "Akali", "Akshan", "Diana", "Ekko", "Elise", "Evelynn", "Fizz", "Kassadin", "Katarina", "Kayn", "Kha'Zix",
    "LeBlanc", "Naafiri", "Nidalee", "Nocturne", "Qiyana", "Rengar", "Shaco", "Talon", "Zed",
    // Locke: PROVISIONAL. Newer than any game in the league's history, and
    // placed by his mid/jungle positions. Confirm once he is played.
    "Locke",
  ],
  mage: [
    "Ahri", "Anivia", "Annie", "Aurelion Sol", "Aurora", "Azir", "Brand", "Cassiopeia", "Fiddlesticks",
    "Gangplank", "Heimerdinger", "Hwei", "Jayce", "Karma", "Karthus", "Kayle", "Kennen", "Lillia", "Lissandra",
    "Lux", "Malzahar", "Mel", "Morgana", "Neeko", "Orianna", "Rumble", "Ryze", "Seraphine", "Swain", "Syndra",
    "Taliyah", "Teemo", "Twisted Fate", "Veigar", "Vel'Koz", "Vex", "Viktor", "Vladimir", "Xerath", "Ziggs",
    "Zoe", "Zyra",
  ],
  marksman: [
    "Aphelios", "Ashe", "Caitlyn", "Corki", "Draven", "Ezreal", "Graves", "Jhin", "Jinx", "Kai'Sa", "Kalista",
    "Kindred", "Kog'Maw", "Lucian", "Miss Fortune",
    // Riot calls Nilah a skirmisher, but she is played bot as a carry and
    // has to be graded against the other carries there.
    "Nilah",
    "Quinn", "Samira", "Senna", "Sivir", "Smolder", "Tristana", "Twitch", "Varus", "Vayne", "Xayah",
    "Yunara", "Zeri",
  ],
  enchanter: ["Ivern", "Janna", "Lulu", "Milio", "Nami", "Renata Glasc", "Sona", "Soraka", "Yuumi", "Zilean"],
};

/** Display name -> class. Exported for the completeness test. */
export const CHAMPION_CLASSES: ReadonlyMap<string, ChampionClass> = new Map(
  (Object.entries(CLASSES) as [ChampionClass, string[]][]).flatMap(([cls, names]) => names.map((name) => [name, cls] as const)),
);

/** Supports that are mages everywhere else but enchanters in the bot lane. */
const SUPPORT_ENCHANTERS = new Set(["Karma", "Seraphine"]);

/** A champion's class, from any spelling raw_stats uses ("MonkeyKing",
 *  "Chogath"). Null for a champion missing from the table. */
export function championClass(champion: string | null | undefined): ChampionClass | null {
  const name = champion?.trim();
  if (!name) return null;
  return CHAMPION_CLASSES.get(championDisplayName(name)) ?? null;
}

/**
 * The style one game is graded as. `role` is raw_stats' spelling (TOP,
 * JUNGLE, MIDDLE, BOTTOM, UTILITY). Null when the champion is unknown.
 *
 * Each role only distinguishes the styles it actually sees often enough to
 * have a history: mid tanks are one bucket rather than vanguards and wardens,
 * and anything a bot laner plays that is neither a marksman nor a mage is
 * "other". Rare buckets fall back to their class across every role when
 * graded (styleRating.ts), so a Cho'Gath bot is still judged as a tank.
 */
export function playstyleOf(role: string | null | undefined, champion: string | null | undefined): Playstyle | null {
  const cls = championClass(champion);
  if (!cls) return null;
  switch (role?.trim().toUpperCase()) {
    case "TOP":
      if (cls === "tank" || cls === "bruiser") return cls;
      if (cls === "skirmisher" || cls === "assassin") return "skirmisher";
      return "ranged";
    case "JUNGLE":
      if (cls === "tank" || cls === "bruiser") return cls;
      if (cls === "assassin" || cls === "skirmisher" || cls === "marksman") return "carry";
      return "mage";
    case "MIDDLE":
      if (cls === "mage" || cls === "enchanter") return "mage";
      if (cls === "assassin") return "assassin";
      if (cls === "skirmisher" || cls === "bruiser") return "fighter";
      if (cls === "marksman") return "marksman";
      return "tank";
    case "BOTTOM":
      return cls === "marksman" || cls === "mage" ? cls : "other";
    case "UTILITY": {
      const name = championDisplayName(champion!.trim());
      if (cls === "enchanter" || SUPPORT_ENCHANTERS.has(name)) return "enchanter";
      if (cls === "tank" || cls === "bruiser" || cls === "skirmisher") return "engage";
      return "mage";
    }
    default:
      return cls;
  }
}

/** What the style bar is labelled. Ten characters at most — the card's bar
 *  labels are sized for "OBJECTIVES". */
export const PLAYSTYLE_LABELS: Record<Playstyle, string> = {
  tank: "Tank",
  engage: "Engage",
  bruiser: "Bruiser",
  skirmisher: "Skirmisher",
  fighter: "Fighter",
  assassin: "Assassin",
  carry: "Carry",
  mage: "Mage",
  marksman: "Marksman",
  ranged: "Ranged",
  enchanter: "Enchanter",
  other: "Playstyle",
};

/** The bar label for a window of games: the style most of them were, or the
 *  neutral "Playstyle" when no style holds a majority. */
export function windowPlaystyleLabel(styles: (Playstyle | null)[]): string {
  const counts = new Map<Playstyle, number>();
  for (const style of styles) if (style) counts.set(style, (counts.get(style) ?? 0) + 1);
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return top && top[1] > styles.length / 2 ? PLAYSTYLE_LABELS[top[0]] : PLAYSTYLE_LABELS.other;
}

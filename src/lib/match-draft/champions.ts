export const DDRAGON_VERSION = "16.16.1";
const DDRAGON_CDN = "https://ddragon.leagueoflegends.com/cdn";

const DATA_DRAGON_IDS: Record<string, string> = {
  "Cho'Gath": "Chogath",
  "Jarvan IV": "JarvanIV",
  "Kai'Sa": "Kaisa",
  "Kha'Zix": "Khazix",
  "Kog'Maw": "KogMaw",
  "LeBlanc": "Leblanc",
  "Lee Sin": "LeeSin",
  "Miss Fortune": "MissFortune",
  "Nunu & Willump": "Nunu",
  "Rek'Sai": "RekSai",
  "Tahm Kench": "TahmKench",
  "Twisted Fate": "TwistedFate",
  "Vel'Koz": "Velkoz",
  "Xin Zhao": "XinZhao",
  Wukong: "MonkeyKing",
  "Bel'Veth": "Belveth",
  "Dr. Mundo": "DrMundo",
  "K'Sante": "KSante",
};

export type ChampionRole = "top" | "jungle" | "mid" | "adc" | "support";

export interface MatchDraftChampion {
  name: string;
  id: string;
  iconUrl: string;
  splashUrl: string;
  /** Typical competitive positions — drives the pool's role filter. A champ
   *  can flex into several; filtering never blocks a pick, only the view. */
  roles: ChampionRole[];
}

/** Primary + common flex positions per champion. Champions missing from this
 *  map show under every role filter rather than disappearing. */
const CHAMPION_ROLES: Record<string, ChampionRole[]> = {
  Aatrox: ["top"],
  Ahri: ["mid"],
  Akali: ["mid", "top"],
  Akshan: ["mid", "top"],
  Alistar: ["support"],
  Ambessa: ["top"],
  Amumu: ["jungle", "support"],
  Anivia: ["mid"],
  Annie: ["mid", "support"],
  Aphelios: ["adc"],
  Ashe: ["adc", "support"],
  "Aurelion Sol": ["mid"],
  Aurora: ["mid", "top"],
  Azir: ["mid"],
  Bard: ["support"],
  "Bel'Veth": ["jungle"],
  Blitzcrank: ["support"],
  Brand: ["support", "mid"],
  Braum: ["support"],
  Briar: ["jungle"],
  Caitlyn: ["adc"],
  Camille: ["top"],
  Cassiopeia: ["mid", "top"],
  "Cho'Gath": ["top"],
  Corki: ["mid", "adc"],
  Darius: ["top"],
  Diana: ["jungle", "mid"],
  "Dr. Mundo": ["top"],
  Draven: ["adc"],
  Ekko: ["jungle", "mid"],
  Elise: ["jungle"],
  Evelynn: ["jungle"],
  Ezreal: ["adc"],
  Fiddlesticks: ["jungle", "support"],
  Fiora: ["top"],
  Fizz: ["mid"],
  Galio: ["mid", "support"],
  Gangplank: ["top"],
  Garen: ["top"],
  Gnar: ["top"],
  Gragas: ["jungle", "top"],
  Graves: ["jungle"],
  Gwen: ["top"],
  Hecarim: ["jungle"],
  Heimerdinger: ["mid", "top", "support"],
  Hwei: ["mid", "support"],
  Illaoi: ["top"],
  Irelia: ["top", "mid"],
  Ivern: ["jungle"],
  Janna: ["support"],
  "Jarvan IV": ["jungle"],
  Jax: ["top", "jungle"],
  Jayce: ["top", "mid"],
  Jhin: ["adc"],
  Jinx: ["adc"],
  "Kai'Sa": ["adc"],
  Kalista: ["adc"],
  Karma: ["support", "mid"],
  Karthus: ["jungle", "mid"],
  Kassadin: ["mid"],
  "K'Sante": ["top"],
  Katarina: ["mid"],
  Kayle: ["top", "mid"],
  Kayn: ["jungle"],
  Kennen: ["top"],
  "Kha'Zix": ["jungle"],
  Kindred: ["jungle"],
  Kled: ["top"],
  "Kog'Maw": ["adc"],
  LeBlanc: ["mid"],
  "Lee Sin": ["jungle"],
  Leona: ["support"],
  Lillia: ["jungle", "top"],
  Lissandra: ["mid"],
  Locke: ["mid", "jungle"],
  Lucian: ["adc", "mid"],
  Lulu: ["support"],
  Lux: ["support", "mid"],
  Malphite: ["top", "support"],
  Malzahar: ["mid"],
  Maokai: ["support", "top", "jungle"],
  "Master Yi": ["jungle"],
  Mel: ["mid", "support"],
  Milio: ["support"],
  "Miss Fortune": ["adc"],
  Mordekaiser: ["top"],
  Morgana: ["support", "mid"],
  Naafiri: ["mid", "jungle"],
  Nami: ["support"],
  Nasus: ["top"],
  Nautilus: ["support"],
  Neeko: ["mid", "support"],
  Nidalee: ["jungle"],
  Nilah: ["adc"],
  Nocturne: ["jungle"],
  "Nunu & Willump": ["jungle"],
  Olaf: ["top", "jungle"],
  Orianna: ["mid"],
  Ornn: ["top"],
  Pantheon: ["support", "top", "mid"],
  Poppy: ["top", "jungle"],
  Pyke: ["support"],
  Qiyana: ["mid", "jungle"],
  Quinn: ["top"],
  Rakan: ["support"],
  Rammus: ["jungle"],
  "Rek'Sai": ["jungle"],
  Rell: ["support"],
  "Renata Glasc": ["support"],
  Renekton: ["top"],
  Rengar: ["jungle", "top"],
  Riven: ["top"],
  Rumble: ["top", "mid"],
  Ryze: ["mid", "top"],
  Samira: ["adc"],
  Sejuani: ["jungle"],
  Senna: ["support", "adc"],
  Seraphine: ["support", "mid", "adc"],
  Sett: ["top", "support"],
  Shaco: ["jungle", "support"],
  Shen: ["top", "support"],
  Shyvana: ["jungle"],
  Singed: ["top"],
  Sion: ["top"],
  Sivir: ["adc"],
  Skarner: ["jungle", "top"],
  Smolder: ["adc", "mid"],
  Sona: ["support"],
  Soraka: ["support"],
  Swain: ["support", "mid"],
  Sylas: ["mid", "top"],
  Syndra: ["mid"],
  "Tahm Kench": ["top", "support"],
  Taliyah: ["jungle", "mid"],
  Talon: ["mid", "jungle"],
  Taric: ["support"],
  Teemo: ["top"],
  Thresh: ["support"],
  Tristana: ["adc", "mid"],
  Trundle: ["top", "jungle"],
  Tryndamere: ["top"],
  "Twisted Fate": ["mid"],
  Twitch: ["adc"],
  Udyr: ["jungle", "top"],
  Urgot: ["top"],
  Varus: ["adc"],
  Vayne: ["adc", "top"],
  Veigar: ["mid"],
  "Vel'Koz": ["support", "mid"],
  Vex: ["mid"],
  Vi: ["jungle"],
  Viego: ["jungle"],
  Viktor: ["mid"],
  Vladimir: ["mid", "top"],
  Volibear: ["top", "jungle"],
  Warwick: ["jungle", "top"],
  Wukong: ["jungle", "top"],
  Xayah: ["adc"],
  Xerath: ["support", "mid"],
  "Xin Zhao": ["jungle"],
  Yasuo: ["mid", "top"],
  Yone: ["mid", "top"],
  Yorick: ["top"],
  Yunara: ["adc"],
  Yuumi: ["support"],
  Zaahen: ["top", "jungle"],
  Zac: ["jungle", "top"],
  Zed: ["mid"],
  Zeri: ["adc"],
  Ziggs: ["mid", "adc"],
  Zilean: ["support", "mid"],
  Zoe: ["mid"],
  Zyra: ["support"],
};

const ALL_ROLES: ChampionRole[] = ["top", "jungle", "mid", "adc", "support"];

const CHAMPION_NAMES = [
  "Aatrox",
  "Ahri",
  "Akali",
  "Akshan",
  "Alistar",
  "Ambessa",
  "Amumu",
  "Anivia",
  "Annie",
  "Aphelios",
  "Ashe",
  "Aurelion Sol",
  "Aurora",
  "Azir",
  "Bard",
  "Bel'Veth",
  "Blitzcrank",
  "Brand",
  "Braum",
  "Briar",
  "Caitlyn",
  "Camille",
  "Cassiopeia",
  "Cho'Gath",
  "Corki",
  "Darius",
  "Diana",
  "Dr. Mundo",
  "Draven",
  "Ekko",
  "Elise",
  "Evelynn",
  "Ezreal",
  "Fiddlesticks",
  "Fiora",
  "Fizz",
  "Galio",
  "Gangplank",
  "Garen",
  "Gnar",
  "Gragas",
  "Graves",
  "Gwen",
  "Hecarim",
  "Heimerdinger",
  "Hwei",
  "Illaoi",
  "Irelia",
  "Ivern",
  "Janna",
  "Jarvan IV",
  "Jax",
  "Jayce",
  "Jhin",
  "Jinx",
  "Kai'Sa",
  "Kalista",
  "Karma",
  "Karthus",
  "Kassadin",
  "K'Sante",
  "Katarina",
  "Kayle",
  "Kayn",
  "Kennen",
  "Kha'Zix",
  "Kindred",
  "Kled",
  "Kog'Maw",
  "LeBlanc",
  "Lee Sin",
  "Leona",
  "Lillia",
  "Lissandra",
  "Locke",
  "Lucian",
  "Lulu",
  "Lux",
  "Malphite",
  "Malzahar",
  "Maokai",
  "Master Yi",
  "Mel",
  "Milio",
  "Miss Fortune",
  "Mordekaiser",
  "Morgana",
  "Naafiri",
  "Nami",
  "Nasus",
  "Nautilus",
  "Neeko",
  "Nidalee",
  "Nilah",
  "Nocturne",
  "Nunu & Willump",
  "Olaf",
  "Orianna",
  "Ornn",
  "Pantheon",
  "Poppy",
  "Pyke",
  "Qiyana",
  "Quinn",
  "Rakan",
  "Rammus",
  "Rek'Sai",
  "Rell",
  "Renata Glasc",
  "Renekton",
  "Rengar",
  "Riven",
  "Rumble",
  "Ryze",
  "Samira",
  "Sejuani",
  "Senna",
  "Seraphine",
  "Sett",
  "Shaco",
  "Shen",
  "Shyvana",
  "Singed",
  "Sion",
  "Sivir",
  "Skarner",
  "Smolder",
  "Sona",
  "Soraka",
  "Swain",
  "Sylas",
  "Syndra",
  "Tahm Kench",
  "Taliyah",
  "Talon",
  "Taric",
  "Teemo",
  "Thresh",
  "Tristana",
  "Trundle",
  "Tryndamere",
  "Twisted Fate",
  "Twitch",
  "Udyr",
  "Urgot",
  "Varus",
  "Vayne",
  "Veigar",
  "Vel'Koz",
  "Vex",
  "Vi",
  "Viego",
  "Viktor",
  "Vladimir",
  "Volibear",
  "Warwick",
  "Wukong",
  "Xayah",
  "Xerath",
  "Xin Zhao",
  "Yasuo",
  "Yone",
  "Yorick",
  "Yunara",
  "Yuumi",
  "Zaahen",
  "Zac",
  "Zed",
  "Zeri",
  "Ziggs",
  "Zilean",
  "Zoe",
  "Zyra",
];

function dataDragonId(name: string): string {
  return DATA_DRAGON_IDS[name] ?? name.replace(/[^A-Za-z0-9]/g, "");
}

function normalizeChampionName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** A champion entry from an explicit Data Dragon version + id — used both
 *  for the static fallback roster below and the live roster fetched from
 *  Riot (lib/match-draft/liveRoster.ts). */
export function championFromDataDragon(version: string, id: string, name: string): MatchDraftChampion {
  return {
    name,
    id,
    iconUrl: `${DDRAGON_CDN}/${version}/img/champion/${id}.png`,
    splashUrl: `${DDRAGON_CDN}/img/champion/splash/${id}_0.jpg`,
    roles: CHAMPION_ROLES[name] ?? ALL_ROLES,
  };
}

function championMeta(name: string): MatchDraftChampion {
  return championFromDataDragon(DDRAGON_VERSION, dataDragonId(name), name);
}

export const CHAMPIONS = CHAMPION_NAMES.map(championMeta);

/** Display name, Data Dragon id, and punctuation-stripped aliases →
 *  champion. The drafter stores display names ("Wukong", "Kai'Sa"), but
 *  raw_stats stores Riot's championName field — the DDragon id
 *  ("MonkeyKing", "Kaisa", "MissFortune") — so resolution must answer for
 *  both spellings of every champion. */
const CHAMPIONS_BY_ALIAS = (() => {
  const map = new Map<string, MatchDraftChampion>();
  for (const champion of CHAMPIONS) {
    for (const alias of [
      normalizeChampionName(champion.name),
      champion.id.toLowerCase(),
      champion.name.replace(/[^A-Za-z0-9]/g, "").toLowerCase(),
    ]) {
      if (alias && !map.has(alias)) map.set(alias, champion);
    }
  }
  return map;
})();

export function championByName(name: string): MatchDraftChampion | null {
  return (
    CHAMPIONS_BY_ALIAS.get(normalizeChampionName(name)) ??
    CHAMPIONS_BY_ALIAS.get(name.replace(/[^A-Za-z0-9]/g, "").toLowerCase()) ??
    null
  );
}

/** The pretty display name for any alias ("MonkeyKing" -> "Wukong"), or
 *  the input unchanged when nothing matches. */
export function championDisplayName(name: string): string {
  return championByName(name)?.name ?? name;
}

/**
 * The Data Dragon id for a champion the bundled roster has never heard of.
 *
 * Riot's ids are the display name with spaces and punctuation stripped
 * (DATA_DRAGON_IDS covers the handful that are not), so a champion released
 * after CHAMPION_NAMES was last updated still points at the right files.
 *
 * This matters because the art helpers used to answer `null` for anyone
 * missing from the list, and null means NO IMAGE — cards, moment plates,
 * scouting rows and match summaries all just rendered a blank where the
 * champion should be. A guessed id that 404s is no worse than that, and for
 * almost every champion it is simply correct.
 *
 * Returns null for a name with nothing alphanumeric left in it, which would
 * otherwise build a URL ending in a bare slash.
 */
function fallbackChampionId(name: string): string | null {
  const id = dataDragonId(name.trim());
  return id.length > 0 ? id : null;
}

export function championIconUrl(name: string): string | null {
  const known = championByName(name);
  if (known) return known.iconUrl;
  const id = fallbackChampionId(name);
  // Icons ARE version-scoped, unlike splash art, so an unknown champion
  // resolves against the pinned version. Keep DDRAGON_VERSION current when
  // bumping patches or new champions lose their icon while keeping splash.
  return id ? `${DDRAGON_CDN}/${DDRAGON_VERSION}/img/champion/${id}.png` : null;
}

/** Riot's full splash art. `skin` picks an alternate skin's art (0 = base).
 *  This directory is the *wider* of Riot's two: nearly every num the skin
 *  catalog lists has a splash, while plenty are missing from `centered`
 *  below — so it's the fallback art the card system falls to. */
export function championSplashUrl(name: string, skin = 0): string | null {
  const id = championByName(name)?.id ?? fallbackChampionId(name);
  // Splash art is NOT version-scoped — this path is always Riot's latest —
  // so it keeps working for a champion released after the pinned version.
  return id ? `${DDRAGON_CDN}/img/champion/splash/${id}_${skin}.jpg` : null;
}

/** Riot's "centered" splash — the horizontal crop with the champion in the
 *  middle, made for wide/tall UI windows (same variant the drafter's pick
 *  slots use). `skin` picks an alternate skin's art (0 = base; numbers are
 *  Riot's skin nums, which can be sparse — callers should tolerate 404s and
 *  fall back to championSplashUrl for the same num). */
export function championCenteredUrl(name: string, skin = 0): string | null {
  return championSplashUrl(name, skin)?.replace("/champion/splash/", "/champion/centered/") ?? null;
}

/** Name → champion resolver over an arbitrary roster (the live Data Dragon
 *  roster or the static fallback), tolerant of spacing/case differences. */
export function championLookup(champions: MatchDraftChampion[]): (name: string) => MatchDraftChampion | null {
  const byName = new Map(champions.map((champion) => [normalizeChampionName(champion.name), champion]));
  return (name) => byName.get(normalizeChampionName(name)) ?? null;
}

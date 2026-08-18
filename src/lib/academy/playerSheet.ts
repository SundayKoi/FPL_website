import { normalizePlayerName } from "@/lib/players/freeAgency";

export const ACADEMY_PLAYER_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1GRCjWINa6k2JgW10L8Bs05tr1jkIAFfCFhb7wTh-GWc/export?format=csv&gid=1133886891";

export type AcademySheetPlayer = { name: string; role: string; rank: string; opggUrl: string | null };

// Each roster's shared multisearch URL, listed once with the players it maps
// to. Note "sabermonika#야스오" stays its own group: its URL encodes a
// different tag than the one its four teammates share.
const ACADEMY_ROSTERS: Array<{ url: string; players: string[] }> = [
  {
    url: "https://op.gg/lol/multisearch/na?summoners=SuperWeeb%23Weeb%2C+Sunless%23bird%2C+Void%23DAG%2C+IQ+OF+A+COCONUT%23NA1%2C+THETRUESUP21%23NA1%2C",
    players: ["superweeb#weeb", "sunless#bird", "void#dag", "iq of a coconut#na1", "thetruesup21#na1"],
  },
  {
    url: "https://op.gg/lol/multisearch/na?summoners=Axriid%23act%2C+x80hdgraphicsx%23na1%2C+DeFaux%23TTM%2C+Cindre%23Flame%2C+LordGibaMoth%23NA1%2C",
    players: ["axriid#act", "x80hdgraphicsx#na1", "defaux#ttm", "cindre#flame", "lordgibamoth#na1"],
  },
  {
    url: "https://op.gg/lol/multisearch/na?summoners=ReginaldDwight%23ELTON%2CPrismaSire%23sire%2CIFFY%23ACT%2Ctrashy%23garb%2CCaesar%23smok",
    players: ["reginalddwight#elton", "prismasire#sire", "iffyxo#act", "trashy#garb", "caeser#smok"],
  },
  {
    url: "https://op.gg/lol/multisearch/na?summoners=Dream+Unforgiven%23NA1%2CFox%231fox%2CSaintofAegis%23Saint%2CGnome+Reaper%23old1%2CSleepyHead1534%23NA1",
    players: ["dream unforgiven#na1", "fox #1fox", "saintofaegis#saint", "gnome reaper#old1", "sleepyhead1534#na1"],
  },
  {
    url: "https://op.gg/lol/multisearch/na?summoners=SaberMonika%23%EC%95%BC%EC%8A%A4%EC%98%A4%2CDoki%230001%2CSylvi24%23NA1%2Cregdor%23win%2CJonicas%23NA1",
    players: ["sabermonika#야스오"],
  },
  {
    url: "https://op.gg/lol/multisearch/na?summoners=SaberMonika%23%EC%95%BC%EC%82%AC%2CDoki%230001%2CSylvi24%23NA1%2Cregdor%23win%2CJonicas%23NA1",
    players: ["doki#0001", "sylvi24 #na1", "regdor#win", "jonicas#na1"],
  },
  {
    url: "https://op.gg/lol/multisearch/na?summoners=DrSalt%233892%2Cbout+tree+fitty%23NA1%2Cdreammeater%23monky%2CSonicx5040%235040%2CKillomanjaro%23NA1",
    players: ["drsalt#3892", "bout tree fitty#na1", "dreammeater#monky", "sonicx5040#5040", "killomanjaro#na1"],
  },
];

const ACADEMY_OPGG_BY_PLAYER: Record<string, string> = Object.fromEntries(
  ACADEMY_ROSTERS.flatMap(({ url, players }) => players.map((player) => [player, url])),
);

export function individualOpggUrl(rosterUrl: string | undefined | null, playerName: string): string | null {
  if (!rosterUrl) return null;
  const query = rosterUrl.match(/[?&]summoners=([^&]+)/)?.[1];
  if (!query) return rosterUrl;
  const playerKey = normalizePlayerName(playerName);
  const account = decodeURIComponent(query.replace(/\+/g, " "))
    .split(",")
    .map((value) => value.trim())
    .find((value) => normalizePlayerName(value.replace(/#[^#]*$/, "")) === playerKey);
  if (!account) return rosterUrl;
  const hashIndex = account.lastIndexOf("#");
  if (hashIndex < 1) return rosterUrl;
  const gameName = account.slice(0, hashIndex);
  const tagLine = account.slice(hashIndex + 1);
  return `https://op.gg/lol/summoners/na/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`;
}

// Normalized exact-match roster URL lookup; with matchGameName, a bare game
// name (no tag) also matches a roster key's game-name prefix.
function rosterUrlForName(name: string, matchGameName = false): string | undefined {
  const normalizedName = normalizePlayerName(name);
  return Object.entries(ACADEMY_OPGG_BY_PLAYER).find(([rosterName]) => {
    const normalizedRosterName = normalizePlayerName(rosterName);
    if (normalizedRosterName === normalizedName) return true;
    return matchGameName && normalizedRosterName.split("#", 1)[0] === normalizedName;
  })?.[1];
}

export function academyOpggUrlForPlayer(playerName: string): string | null {
  return individualOpggUrl(rosterUrlForName(playerName, true), playerName);
}

export function mergeAcademyPlayers(
  draftPlayers: Array<{ display_name: string; role: string; rank?: string | null }>,
  sheetPlayers: AcademySheetPlayer[],
): AcademySheetPlayer[] {
  const sheetByName = new Map(sheetPlayers.map((player) => [normalizePlayerName(player.name), player]));
  return draftPlayers.map((player) => {
    const sheetPlayer = sheetByName.get(normalizePlayerName(player.display_name));
    const rosterOpggUrl = rosterUrlForName(player.display_name);
    return {
      name: player.display_name,
      role: sheetPlayer?.role ?? (player.role[0].toUpperCase() + player.role.slice(1)),
      rank: sheetPlayer?.rank || player.rank || "Unranked",
      opggUrl:
        individualOpggUrl(sheetPlayer?.opggUrl, player.display_name) ??
        individualOpggUrl(rosterOpggUrl, player.display_name),
    };
  });
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"' && quoted) {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

function headerIndex(headers: string[], names: string[]): number {
  return headers.findIndex((header) => names.includes(header.trim().toLowerCase()));
}

function sheetUrl(value: string | undefined): string | null {
  if (!value) return null;
  const hyperlink = /^=HYPERLINK\(\s*["']?([^,"')]+)["']?/i.exec(value.trim());
  if (hyperlink) value = hyperlink[1];
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parseAcademyPlayers(csv: string): AcademySheetPlayer[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]);
  const nameColumn = headerIndex(headers, ["name", "player", "player name", "display name"]);
  const roleColumn = headerIndex(headers, ["role", "position"]);
  const rankColumn = headerIndex(headers, ["rank", "tier", "elo"]);
  const opggColumn = headerIndex(headers, ["op.gg", "opgg", "op.gg link", "opgg link", "op.gg url", "opgg url"]);
  if (nameColumn < 0) return [];

  return lines.slice(1).flatMap((line) => {
    const values = parseCsvLine(line);
    const name = values[nameColumn]?.trim();
    if (!name) return [];
    return [{ name, role: values[roleColumn]?.trim() || "Unassigned", rank: values[rankColumn]?.trim() || "Unranked", opggUrl: sheetUrl(values[opggColumn]) }];
  });
}

export async function fetchAcademyPlayers(): Promise<AcademySheetPlayer[]> {
  try {
    const response = await fetch(ACADEMY_PLAYER_SHEET_URL, { next: { revalidate: 300 } });
    if (!response.ok) return [];
    return parseAcademyPlayers(await response.text());
  } catch {
    return [];
  }
}

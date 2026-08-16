import { normalizePlayerName } from "@/lib/players/freeAgency";

export const ACADEMY_PLAYER_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1GRCjWINa6k2JgW10L8Bs05tr1jkIAFfCFhb7wTh-GWc/export?format=csv&gid=1133886891";

export type AcademySheetPlayer = { name: string; role: string; rank: string; opggUrl: string | null };

export function mergeAcademyPlayers(
  draftPlayers: Array<{ display_name: string; role: string; rank?: string | null }>,
  sheetPlayers: AcademySheetPlayer[],
): AcademySheetPlayer[] {
  const sheetByName = new Map(sheetPlayers.map((player) => [normalizePlayerName(player.name), player]));
  return draftPlayers.map((player) => {
    const sheetPlayer = sheetByName.get(normalizePlayerName(player.display_name));
    return {
      name: player.display_name,
      role: sheetPlayer?.role ?? (player.role[0].toUpperCase() + player.role.slice(1)),
      rank: sheetPlayer?.rank || player.rank || "Unranked",
      opggUrl: sheetPlayer?.opggUrl ?? null,
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

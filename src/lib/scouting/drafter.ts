import { LCS_DRAFT_STEPS } from "@/lib/match-draft/rules";
import type { DraftSide, MatchDraftAction, MatchDraftPositions } from "@/lib/match-draft/types";
import type { ScoutDraftRow } from "./types";

export interface DrafterPageInput {
  fixtureId: string;
  blueTeamName: string | null;
  redTeamName: string | null;
  gameSides?: Record<number, { blueTeamName: string | null; redTeamName: string | null }>;
}

type UnknownRow = Record<string, unknown>;

function jsonValueAfterKey(text: string, key: string): unknown[] | null {
  const keyIndex = text.indexOf(`"${key}"`);
  if (keyIndex < 0) return null;
  const start = text.indexOf("[", keyIndex);
  if (start < 0) return null;

  let depth = 0;
  let escaped = false;
  let inString = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "[") depth += 1;
    else if (character === "]") {
      depth -= 1;
      if (depth === 0) {
        try {
          const value = JSON.parse(text.slice(start, index + 1));
          return Array.isArray(value) ? value : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function drafterPayloads(html: string): string[] {
  const payloads: string[] = [];
  const pattern = /self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)/g;
  for (const match of html.matchAll(pattern)) {
    try {
      payloads.push(JSON.parse(match[1]));
    } catch {
      // Ignore unrelated or malformed Next flight chunks.
    }
  }
  return payloads;
}

function stringValue(row: UnknownRow, key: string): string | null {
  return typeof row[key] === "string" && row[key].trim() ? row[key] as string : null;
}

function positionsFor(row: UnknownRow, side: DraftSide): (string | null)[] | undefined {
  const raw = row.roleAssignments;
  if (!raw || typeof raw !== "object") return undefined;
  const assignment = (raw as UnknownRow)[side];
  if (!assignment || typeof assignment !== "object") return undefined;
  const roles = ["top", "jungle", "mid", "adc", "support"];
  const positions = roles.map((role) => stringValue(assignment as UnknownRow, role));
  return positions.some(Boolean) ? positions : undefined;
}

function actionFor(row: UnknownRow, step: typeof LCS_DRAFT_STEPS[number]): MatchDraftAction {
  const key = `${step.side}${step.kind === "ban" ? "Ban" : "Pick"}${step.slot}`;
  const champion = stringValue(row, key);
  return {
    stepIndex: step.index,
    side: step.side,
    kind: step.kind,
    slot: step.slot,
    champion,
    ...(champion ? {} : { skipped: true }),
    playerName: null,
  };
}

export function parseDrafterPage(html: string, input: DrafterPageInput): ScoutDraftRow[] {
  for (const payload of drafterPayloads(html)) {
    const drafts = jsonValueAfterKey(payload, "drafts");
    if (!drafts) continue;
    return drafts
      .filter((value): value is UnknownRow => Boolean(value) && typeof value === "object")
      .filter((row) => row.done !== false)
      .map((row, index) => {
        const gameNumber = typeof row.gameNumber === "number" ? row.gameNumber : index + 1;
        const sides = input.gameSides?.[gameNumber];
        const positions: MatchDraftPositions = {};
        const bluePositions = positionsFor(row, "blue");
        const redPositions = positionsFor(row, "red");
        if (bluePositions) positions.blue = bluePositions;
        if (redPositions) positions.red = redPositions;
        return {
          id: `drafter:${input.fixtureId}:${gameNumber}`,
          fixture_id: input.fixtureId,
          game_number: gameNumber,
          blue_team_name: sides?.blueTeamName ?? input.blueTeamName,
          red_team_name: sides?.redTeamName ?? input.redTeamName,
          winner_team: null,
          actions: LCS_DRAFT_STEPS.map((step) => actionFor(row, step)),
          positions: positions.blue || positions.red ? positions : null,
          created_at: stringValue(row, "updatedAt") ?? stringValue(row, "createdAt") ?? "",
        };
      });
  }
  return [];
}

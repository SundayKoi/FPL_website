// Subs. A game's rows name whoever was in the game, so a sub, someone on
// neither team's roster (another entrant included), would otherwise rate as
// a stranger and the player they stood in for would miss the game. Each such
// row is credited to the rostered player missing from that game instead:
// the one in the same role, else the only one missing. Their stats, Overall
// and card then carry the game, and the row remembers who really played it.
//
// Worked out from the rosters on every read; nothing is stored, so a roster
// fix or a late ingest re-attributes on its own.

import { cardPlayerKey } from "@/lib/cards/cardKeys";
import type { LolRole } from "@/lib/draft/types";
import { entrantKey, type OffseasonStatRow } from "./ratings";
import { splitRiotId, type OffseasonEventData } from "./types";

/** Riot's teamPosition for each draft role. */
const POSITION: Record<LolRole, string> = { top: "TOP", jungle: "JUNGLE", mid: "MIDDLE", adc: "BOTTOM", support: "UTILITY" };

/** One game a sub played in a rostered player's place. */
export interface SubAppearance {
  riotMatchId: string;
  /** offseason_matches.id */
  matchId: string;
  teamId: string;
  /** The rostered player the game counts for. */
  entrantId: string;
  /** Who really played, as Riot names them. */
  playedBy: string;
}

interface Slot {
  teamId: string;
  entrantId: string;
  role: LolRole;
}

/**
 * The rows with every sub's row credited to the player they replaced
 * (`played_by` keeps who played), and the list of those appearances.
 * Rows of games the event doesn't know, or that can't be read with
 * confidence, are left as they are.
 */
export function attributeSubs(
  data: Pick<OffseasonEventData, "entrants" | "members" | "matches" | "games">,
  rows: OffseasonStatRow[],
): { rows: OffseasonStatRow[]; subs: SubAppearance[] } {
  const keyOf = new Map(data.entrants.map((entrant) => [entrant.id, entrantKey(entrant.riot_id)]));
  const riotIdOf = new Map(data.entrants.map((entrant) => [entrant.id, entrant.riot_id]));
  const matchById = new Map(data.matches.map((match) => [match.id, match]));
  const matchOfGame = new Map(data.games.filter((game) => game.riot_match_id).map((game) => [game.riot_match_id!, game.match_id]));
  const rowsByGame = new Map<string, OffseasonStatRow[]>();
  for (const row of rows) {
    const list = rowsByGame.get(row.match_id);
    if (list) list.push(row);
    else rowsByGame.set(row.match_id, [row]);
  }

  const credited = new Map<OffseasonStatRow, OffseasonStatRow>();
  const subs: SubAppearance[] = [];
  for (const [riotMatchId, gameRows] of rowsByGame) {
    const match = matchById.get(matchOfGame.get(riotMatchId) ?? "");
    if (!match) continue;
    const teamIds = [match.team_a_id, match.team_b_id];
    const roster = new Map<string, Slot>();
    for (const member of data.members) {
      const key = keyOf.get(member.entrant_id);
      if (teamIds.includes(member.team_id) && key) roster.set(key, { teamId: member.team_id, entrantId: member.entrant_id, role: member.role });
    }

    // Which team played which side: the one most of that side's rostered rows belong to.
    const own = new Map<OffseasonStatRow, Slot>();
    const sides = new Map<string, OffseasonStatRow[]>();
    for (const row of gameRows) {
      const slot = roster.get(cardPlayerKey(row.summoner_name, row.tag));
      if (slot) own.set(row, slot);
      const side = row.team_side ?? "";
      sides.set(side, [...(sides.get(side) ?? []), row]);
    }
    const teamOfSide = new Map<string, string>();
    for (const [side, sideRows] of sides) {
      const counts = new Map<string, number>();
      for (const row of sideRows) {
        const slot = own.get(row);
        if (slot) counts.set(slot.teamId, (counts.get(slot.teamId) ?? 0) + 1);
      }
      const ranked = [...counts].sort((a, b) => b[1] - a[1]);
      if (ranked.length > 0 && (ranked.length === 1 || ranked[0][1] > ranked[1][1])) teamOfSide.set(side, ranked[0][0]);
    }
    // A side with no rostered player at all is the other team, when that is clear.
    const unclaimed = teamIds.filter((teamId) => ![...teamOfSide.values()].includes(teamId));
    const unresolved = [...sides.keys()].filter((side) => !teamOfSide.has(side));
    if (unclaimed.length === 1 && unresolved.length === 1 && sides.size === 2) teamOfSide.set(unresolved[0], unclaimed[0]);

    for (const [side, teamId] of teamOfSide) {
      const sideRows = sides.get(side)!;
      const present = new Set(sideRows.flatMap((row) => (own.get(row)?.teamId === teamId ? [own.get(row)!.entrantId] : [])));
      const missing = data.members
        .filter((member) => member.team_id === teamId && !present.has(member.entrant_id))
        .map((member) => ({ teamId, entrantId: member.entrant_id, role: member.role }));
      const strangers = sideRows.filter((row) => !own.has(row));

      const pairs: [OffseasonStatRow, Slot][] = [];
      for (const row of strangers) {
        const index = missing.findIndex((slot) => POSITION[slot.role] === (row.role ?? "").toUpperCase());
        if (index >= 0) pairs.push([row, missing.splice(index, 1)[0]]);
      }
      const left = strangers.filter((row) => !pairs.some(([paired]) => paired === row));
      if (left.length === 1 && missing.length === 1) pairs.push([left[0], missing[0]]);

      for (const [row, slot] of pairs) {
        const name = splitRiotId(riotIdOf.get(slot.entrantId) ?? "");
        if (!name) continue;
        const playedBy = `${row.summoner_name}#${row.tag}`;
        credited.set(row, { ...row, summoner_name: name.name, tag: name.tag, played_by: playedBy });
        subs.push({ riotMatchId, matchId: match.id, teamId, entrantId: slot.entrantId, playedBy });
      }
    }
  }
  return { rows: rows.map((row) => credited.get(row) ?? row), subs };
}

// The league's real calendar, read into a run: which teams play on the day
// a squad launches (the match-day surge), who a one-roster squad's next
// opponent is (the rival fork), and which cards were in the game a moment
// happened in (the echo). Pure — fixtures and edition cards are handed in,
// so the page, the claim and the tests read the same rules.

import { teamBadgeKey, type PlayerCardData } from "@/lib/cards/build";
import { easternDateOf } from "@/lib/packs/week";
import type { CardCopy } from "./config";

/** The slice of a fixture these rules read. */
export interface FixtureLike {
  team_a: string | null;
  team_b: string | null;
  scheduled_at: string | null;
}

/** Team names, keyed the way the badges are (case and punctuation blind),
 *  each mapped to the name as the fixture spells it. */
export type PlayingTeams = Map<string, string>;

/** Every team with a fixture on `dateIso` (an Eastern calendar day). A
 *  fixture with no time, or with a TBD side, counts for the side it names. */
export function teamsPlayingOn(fixtures: FixtureLike[], dateIso: string): PlayingTeams {
  const playing: PlayingTeams = new Map();
  for (const fixture of fixtures) {
    if (!fixture.scheduled_at) continue;
    const at = new Date(fixture.scheduled_at);
    if (Number.isNaN(at.getTime()) || easternDateOf(at) !== dateIso) continue;
    for (const team of [fixture.team_a, fixture.team_b]) {
      if (team && team.trim()) playing.set(teamBadgeKey(team), team.trim());
    }
  }
  return playing;
}

/** The team a card plays for, keyed — null on a card with no team (a
 *  moment, a plate, a relic). */
export function cardTeamKey(copy: Pick<CardCopy, "card">): string | null {
  const name = copy.card?.teamName;
  return name && name.trim() ? teamBadgeKey(name) : null;
}

/** The teams in `playing` that the squad carries a card of — the surge's
 *  reason, as the fixture spells them, each once. Empty means no surge. */
export function surgeTeams(copies: Pick<CardCopy, "card">[], playing: PlayingTeams): string[] {
  const hit = new Map<string, string>();
  for (const copy of copies) {
    const key = cardTeamKey(copy);
    if (key === null) continue;
    const name = playing.get(key);
    if (name) hit.set(key, name);
  }
  return [...hit.values()];
}

/** The one team a squad is drawn from, or null when it is mixed or any
 *  card has no team. A rally's condition, reused for the rival fork. */
export function rosterTeam(copies: Pick<CardCopy, "card">[]): string | null {
  if (copies.length === 0) return null;
  const keys = new Set(copies.map(cardTeamKey));
  if (keys.size !== 1 || keys.has(null)) return null;
  return copies[0].card?.teamName?.trim() ?? null;
}

/** Who `team` plays next, on or after `after`: the other side of their
 *  soonest fixture with a time. Null with no fixture ahead, or when the
 *  other side is still TBD — the singing under the floor stays nameless. */
export function nextOpponent(fixtures: FixtureLike[], team: string, after: Date): string | null {
  const key = teamBadgeKey(team);
  let best: { at: number; other: string } | null = null;
  for (const fixture of fixtures) {
    if (!fixture.scheduled_at) continue;
    const at = new Date(fixture.scheduled_at).getTime();
    if (Number.isNaN(at) || at < after.getTime()) continue;
    const a = fixture.team_a?.trim() ?? "";
    const b = fixture.team_b?.trim() ?? "";
    const other = a && teamBadgeKey(a) === key ? b : b && teamBadgeKey(b) === key ? a : null;
    if (other === null) continue;
    if (best === null || at < best.at) best = { at, other };
  }
  return best && best.other ? best.other : null;
}

/** The cards that were in the game a moment happened in: everyone on the
 *  moment's team and on the other side, from the edition of that week.
 *  The moment's own player is in the game too, and stays in the pool. */
export function echoPool(
  moment: { teamName: string | null; opponent?: string | null },
  edition: PlayerCardData[],
): PlayerCardData[] {
  const sides = new Set(
    [moment.teamName, moment.opponent].filter((name): name is string => typeof name === "string" && name.trim() !== "").map(teamBadgeKey),
  );
  if (sides.size === 0) return [];
  return edition.filter((card) => !card.moment && !card.team && !card.champWin && card.teamName && sides.has(teamBadgeKey(card.teamName)));
}

// Season standings: the season's roads, scored, and the three marks the
// close awards. The scoring is the expedition_standings view's
// (20261013000001) — miles walked, loot brought home, Legendary
// homecomings, rivals beaten — and this is the pure reading of its rows:
// the order the board lists them in, who would take each mark today,
// and what a mark is called. Marks only: nothing here moves a dollar.

export type AccoladeKind = "pathfinder" | "plunderer" | "survivor";

export interface StandingRow {
  discordId: string;
  username: string;
  avatarUrl: string | null;
  runs: number;
  miles: number;
  loot: number;
  survivals: number;
  rivalsBeaten: number;
}

export interface Accolade {
  kind: AccoladeKind;
  discordId: string;
  username: string;
  value: number;
  awardedAt: string;
}

export interface AccoladeDef {
  key: AccoladeKind;
  label: string;
  glyph: string;
  /** The standing it is awarded on. */
  stat: "miles" | "loot" | "survivals";
  does: string;
  accent: string;
}

/** The three marks, in the order the close awards them. */
export const ACCOLADES: Record<AccoladeKind, AccoladeDef> = {
  pathfinder: { key: "pathfinder", label: "Pathfinder", glyph: "⟟", stat: "miles", does: "The most miles walked this season.", accent: "#e0b45a" },
  plunderer: { key: "plunderer", label: "Plunderer", glyph: "◈", stat: "loot", does: "The most loot brought home this season.", accent: "#7dd3a8" },
  survivor: { key: "survivor", label: "Survivor", glyph: "✧", stat: "survivals", does: "The most Legendary routes brought home whole this season.", accent: "#c9b4ff" },
};

export const ACCOLADE_ORDER: AccoladeKind[] = ["pathfinder", "plunderer", "survivor"];

/** The board's order: miles first, then loot, then homecomings, then the
 *  name — the road walked is the standing, the rest is the tie. */
export function rankStandings(rows: StandingRow[]): StandingRow[] {
  return [...rows].sort(
    (a, b) => b.miles - a.miles || b.loot - a.loot || b.survivals - a.survivals || b.rivalsBeaten - a.rivalsBeaten || a.username.localeCompare(b.username),
  );
}

/** Who would take a mark if the season closed now: the top of its
 *  standing, above zero, ties to the lower discord id — exactly the pick
 *  close_expedition_season makes, so the preview is the award. */
export function leaderOf(rows: StandingRow[], kind: AccoladeKind): StandingRow | null {
  const stat = ACCOLADES[kind].stat;
  let best: StandingRow | null = null;
  for (const row of rows) {
    if (row[stat] <= 0) continue;
    if (!best || row[stat] > best[stat] || (row[stat] === best[stat] && row.discordId < best.discordId)) best = row;
  }
  return best;
}

/** "Pathfinder — Ann, 42 miles", for a chip or a Discord line. */
export function accoladeLine(accolade: Pick<Accolade, "kind" | "username" | "value">): string {
  const def = ACCOLADES[accolade.kind];
  const unit = def.stat === "miles" ? `${accolade.value} mile${accolade.value === 1 ? "" : "s"}` : def.stat === "loot" ? `$${accolade.value.toLocaleString("en-US")}` : `${accolade.value} homecoming${accolade.value === 1 ? "" : "s"}`;
  return `${def.glyph} ${def.label} — ${accolade.username}, ${unit}`;
}

/** The marks a collector holds this season, in award order. */
export function accoladesOf(accolades: Accolade[], discordId: string): AccoladeDef[] {
  return ACCOLADE_ORDER.filter((kind) => accolades.some((accolade) => accolade.kind === kind && accolade.discordId === discordId)).map((kind) => ACCOLADES[kind]);
}

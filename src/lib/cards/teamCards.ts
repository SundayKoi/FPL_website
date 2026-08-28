// Grouping player cards into rosters.
//
// A team card wants two things the player grid doesn't: one card per ROLE
// (a five-panel plate with two mids and no support is not a team), and
// each player's most-played champion, which is the art each panel wears.
// Both already exist on every card — this just arranges them.

import { tierFor, type PlayerCardData } from "./build";

/** The five panels, in the order they print — the order a draft is read. */
export const TEAM_ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export interface TeamCardSlot {
  role: TeamRole;
  name: string;
  slug: string | null;
  overall: number;
  /** The player's most-played champion — the panel's splash. Null on a
   *  card with no games recorded on any one champion. */
  champion: string | null;
  /** Holding this week's Card of the Week. */
  standout: boolean;
}

export interface TeamCardEntry {
  teamName: string;
  imageUrl: string | null;
  /** Initials, for a team we hold no logo for. */
  monogram: string;
  bannerColor: string;
  overall: number;
  tier: ReturnType<typeof tierFor>;
  slots: TeamCardSlot[];
  /** Everyone on the roster, best first — the roster list under the card. */
  players: PlayerCardData[];
}

/** What a team with no banner colour set wears: the league's own coral,
 *  so an unconfigured team still looks deliberate rather than grey. */
export const DEFAULT_TEAM_COLOR = "#ff6b35";

const EMPTY_SLOT = (role: TeamRole): TeamCardSlot => ({
  role,
  name: "—",
  slug: null,
  overall: 0,
  champion: null,
  standout: false,
});

function monogramOf(teamName: string): string {
  return teamName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

/**
 * Group player cards into team cards.
 *
 * The rating is the mean of the five best cards, so a sub or a one-game
 * stand-in can't drag a roster's number down. The PANELS are filled by
 * role — best card in each — and a role nobody covers prints an empty
 * slot rather than borrowing someone else's, because a team card that
 * quietly plays a mid in the support panel is lying about the roster.
 */
export function buildTeamCards(
  cards: PlayerCardData[],
  colors?: Map<string, string>,
  colorKey: (teamName: string) => string = (name) => name.trim().toLowerCase().replace(/[^a-z0-9]/g, ""),
): TeamCardEntry[] {
  const byTeam = new Map<string, PlayerCardData[]>();
  for (const card of cards) {
    if (!card.teamName) continue;
    const list = byTeam.get(card.teamName) ?? [];
    list.push(card);
    byTeam.set(card.teamName, list);
  }

  return [...byTeam.entries()]
    .map(([teamName, players]) => {
      const rated = [...players].sort((a, b) => b.overall - a.overall);
      const core = rated.slice(0, 5);
      const overall = Math.round(core.reduce((sum, player) => sum + player.overall, 0) / core.length);
      const slots = TEAM_ROLES.map((role) => {
        // `rated` is sorted, so the first match is the best card in the role.
        const player = rated.find((candidate) => candidate.role === role);
        if (!player) return EMPTY_SLOT(role);
        return {
          role,
          name: player.name,
          slug: player.slug,
          overall: player.overall,
          champion: player.signature?.champion ?? null,
          standout: player.standout === true,
        };
      });

      return {
        teamName,
        imageUrl: rated.find((player) => player.teamImageUrl)?.teamImageUrl ?? null,
        monogram: monogramOf(teamName),
        bannerColor: colors?.get(colorKey(teamName)) ?? DEFAULT_TEAM_COLOR,
        overall,
        tier: tierFor(overall),
        slots,
        players: rated,
      };
    })
    .sort((a, b) => b.overall - a.overall || a.teamName.localeCompare(b.teamName));
}

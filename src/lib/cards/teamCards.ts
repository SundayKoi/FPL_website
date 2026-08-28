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
  /** The player's inked autograph, when they have signed their card — a
   *  PNG data URI. A roster where four of the five have signed is a
   *  genuinely different object from one where nobody has. */
  autograph: string | null;
}

/**
 * A roster print — everything the card draws, flat and serializable so a
 * PULLED copy can freeze it.
 *
 * The live page rebuilds this every week from the newest ratings, but a
 * copy in someone's collection is a SNAPSHOT of the week it came out of:
 * week-3 Faceless and week-8 Faceless are different collectibles with
 * different champions, different overalls and possibly a different
 * roster. That is the same promise every other card in the game makes,
 * and it is the reason to open an edition pack for a specific week.
 */
export interface TeamPrint {
  teamName: string;
  imageUrl: string | null;
  /** Initials, for a team we hold no logo for. */
  monogram: string;
  bannerColor: string;
  overall: number;
  tierKey: string;
  tierLabel: string;
  slots: TeamCardSlot[];
  /** The edition this roster was minted from. */
  weekStart: string;
  /** Which mint of this team-week the copy is (1 = first pulled). */
  copySerial?: number | null;
}

export interface TeamCardEntry extends TeamPrint {
  /** Everyone on the roster, best first — the roster list under the card. */
  players: PlayerCardData[];
}

/** The tier a pulled roster plate files under, so it never dusts as an
 *  ordinary card of whatever tier its rating happened to land in. */
export const TEAM_TIER = "team";

/** Dust for a pulled roster plate. Flat, like moments and champions
 *  relics and for the same reason — a team card has no tier of its own to
 *  scale off. Sits well under MOMENT_DUST: a roster is a rarer pull than
 *  a player, and a far commoner one than a moment. */
export const TEAM_DUST = 400;

/** Chance a pack carries a roster plate instead of its last card. Rolled
 *  once per PACK like the moment roll — about one pack in twenty-five. */
export const TEAM_PULL_CHANCE = 0.04;

/** Stable key for a team-week print, so copies of the same roster print
 *  from the same week share a serial line. */
export function teamCardSlug(teamName: string, weekStart: string): string {
  return `team-${teamName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${weekStart}`;
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
  autograph: null,
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
  weekStart = "",
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
          autograph: player.autograph ?? null,
        };
      });

      const tier = tierFor(overall);
      return {
        teamName,
        imageUrl: rated.find((player) => player.teamImageUrl)?.teamImageUrl ?? null,
        monogram: monogramOf(teamName),
        bannerColor: colors?.get(colorKey(teamName)) ?? DEFAULT_TEAM_COLOR,
        overall,
        tierKey: tier.key,
        tierLabel: tier.label,
        slots,
        weekStart,
        players: rated,
      };
    })
    .sort((a, b) => b.overall - a.overall || a.teamName.localeCompare(b.teamName));
}

/**
 * The card-shaped wrapper a pulled roster plate is stored and rendered as.
 *
 * Same trick moments use: inventory, the binder and the pack reveal all
 * speak PlayerCardData, so a team print rides inside one and every
 * surface carries it without changes. The renderer branches on `team`
 * before it reads a single rating field.
 */
export function teamToCard(print: TeamPrint, season: string, copySerial: number): PlayerCardData {
  return {
    team: { ...print, copySerial },
    slug: teamCardSlug(print.teamName, print.weekStart),
    name: print.teamName,
    tag: print.monogram,
    teamName: print.teamName,
    teamImageUrl: print.imageUrl,
    teamAbbr: print.monogram,
    role: "Team",
    overall: print.overall,
    tier: { key: TEAM_TIER, label: "Roster" },
    archetype: "Roster",
    signature: null,
    artSkin: 0,
    autograph: null,
    motto: null,
    serial: copySerial,
    collectionSize: 0,
    topChampions: [],
    form: [],
    subStats: [],
    highlights: [],
    badges: [],
    standout: false,
    wins: 0,
    losses: 0,
    winratePct: 0,
    level: 0,
    pentas: 0,
    season,
  } as unknown as PlayerCardData;
}

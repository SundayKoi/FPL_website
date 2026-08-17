import {
  ROLE_ORDER,
  type Player,
  type Profile,
  type RosterTeamView,
  type Team,
} from "@/lib/draft/types";
import { normalizeBannerColor } from "@/lib/teams/bannerColor";

const accentClasses = [
  "bg-cyan-950",
  "bg-red-950",
  "bg-violet-950",
  "bg-emerald-950",
  "bg-amber-950",
  "bg-sky-950",
] as const;

export function toRosterTeams(
  teams: Team[],
  players: Player[],
  profiles: Profile[] = [],
): RosterTeamView[] {
  const profileNames = new Map(profiles.map((profile) => [profile.id, profile.display_name]));

  return teams.map((team, teamIndex) => {
    const roster = players.filter((player) => player.team_id === team.id);
    const captain = roster.find((player) => player.acquisition === "captain");
    const derivedMonogram = team.name
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 3)
      .toUpperCase();

    return {
      id: team.id,
      name: team.name,
      abbreviation: team.abbreviation,
      imageUrl: team.image_url,
      bannerColor: normalizeBannerColor(team.banner_color),
      division: team.division ?? null,
      // The profile id remains the auth/permissions link, but the roster's
      // captain player is the public league identity shown on team pages.
      captainName: captain?.display_name ?? profileNames.get(team.captain_profile_id ?? "") ?? "Unassigned",
      monogram: derivedMonogram,
      accentClass: accentClasses[teamIndex % accentClasses.length],
      players: ROLE_ORDER.map((role) => {
        const player = roster.find((candidate) => candidate.role === role);
        return player
          ? {
              id: player.id,
              role: player.role,
              displayName: player.display_name,
              opggUrl: player.opgg_url,
              price: player.price ?? 0,
              acquisition: player.acquisition,
            }
          : {
              id: `empty-${team.id}-${role}`,
              role,
              displayName: "Open slot",
              price: 0,
              acquisition: null,
              isEmpty: true,
            };
      }),
    };
  });
}

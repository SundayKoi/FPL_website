import { ROLE_ORDER, type Player, type RosterTeamView, type Team } from "@/lib/draft/types";

const accentClasses = [
  "bg-cyan-950",
  "bg-red-950",
  "bg-violet-950",
  "bg-emerald-950",
  "bg-amber-950",
  "bg-sky-950",
] as const;

export function toRosterTeams(teams: Team[], players: Player[]): RosterTeamView[] {
  return teams.map((team, teamIndex) => {
    const roster = players.filter((player) => player.team_id === team.id);
    const captain = roster.find((player) => player.acquisition === "captain");

    return {
      id: team.id,
      name: team.name,
      captainName: captain?.display_name ?? "Unassigned",
      monogram: team.name
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 3)
        .toUpperCase(),
      accentClass: accentClasses[teamIndex % accentClasses.length],
      pointsRemaining: team.points_remaining,
      players: ROLE_ORDER.map((role) => {
        const player = roster.find((candidate) => candidate.role === role);
        return player
          ? {
              id: player.id,
              role: player.role,
              displayName: player.display_name,
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

import TeamColumn from "./TeamColumn";
import type { Player, Team } from "@/lib/draft/types";

export default function FinalRosters({
  teams,
  players,
  myTeamId,
}: {
  teams: Team[];
  players: Player[];
  myTeamId: string | null;
}) {
  const teamSpent = (team: Team) =>
    players.filter((p) => p.team_id === team.id).reduce((sum, p) => sum + (p.price ?? 0), 0);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-zinc-300">Final rosters</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {teams.map((team) => (
          <div key={team.id} className="flex flex-col gap-1">
            <TeamColumn team={team} players={players} isNominator={false} isMyTeam={myTeamId === team.id} />
            <p className="text-center text-xs text-zinc-500">
              Spent: <span className="font-mono text-zinc-300">{teamSpent(team)}</span>
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

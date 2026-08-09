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
      <h2 className="type-display text-xl text-white">Final rosters</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {teams.map((team) => (
          <div key={team.id} className="flex flex-col gap-1">
            <TeamColumn team={team} players={players} isNominator={false} isMyTeam={myTeamId === team.id} />
            <p className="text-center text-xs text-steel">
              Spent: <span className="font-display font-semibold not-italic text-gold">{teamSpent(team)}</span>
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

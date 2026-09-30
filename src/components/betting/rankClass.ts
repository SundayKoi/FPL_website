/** Leaderboard rank colour: gold, silver and bronze for the podium. */
export function rankClass(rank: number | null): string {
  if (rank === 1) return "text-gold";
  if (rank === 2) return "text-muted";
  if (rank === 3) return "text-amber-600";
  return "text-muted/60";
}

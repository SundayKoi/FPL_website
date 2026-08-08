import { ROLE_ORDER, type Draft, type Lot, type LolRole, type Player, type Team } from "./types";

export function openRoles(teamId: string, players: Player[]): LolRole[] {
  const filled = new Set(players.filter((p) => p.team_id === teamId).map((p) => p.role));
  return ROLE_ORDER.filter((r) => !filled.has(r));
}

export function maxBid(team: Team, players: Player[]): number {
  return team.points_remaining - (openRoles(team.id, players).length - 1);
}

export function bidBlockReason(
  team: Team, lot: Lot, lotPlayer: Player, players: Player[], amount: number
): string | null {
  if (lot.status !== "open") return "Auction is over";
  if (lot.leading_team_id === team.id) return "You hold the high bid";
  if (!openRoles(team.id, players).includes(lotPlayer.role)) return `You already have a ${lotPlayer.role}`;
  if (amount < lot.current_bid + 1) return `Bid at least ${lot.current_bid + 1}`;
  if (amount > maxBid(team, players)) return `Your max bid is ${maxBid(team, players)}`;
  return null;
}

export function nominateBlockReason(
  team: Team, player: Player, draft: Draft, players: Player[]
): string | null {
  if (draft.status !== "live") return "Draft is not live";
  if (draft.current_nominator_team_id !== team.id) return "Not your turn";
  if (player.team_id !== null) return "Player already taken";
  if (!openRoles(team.id, players).includes(player.role)) return `You already have a ${player.role}`;
  const min = draft.round_minimums[Math.min(draft.current_round, draft.round_minimums.length) - 1];
  if (min > maxBid(team, players)) return `You can't afford the ${min}-point opening bid`;
  return null;
}

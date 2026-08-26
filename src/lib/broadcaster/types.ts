import type { PlayerCardData } from "@/lib/cards/build";

export interface BroadcasterPlayerAverages {
  games: number;
  kda: number;
  damagePerMin: number;
  visionPerMin: number;
  turretsPerGame: number;
  goldPerMin: number;
  multiKills: number;
}

export interface BroadcasterPlayerRecord {
  games: number;
  wins: number;
  losses: number;
  winratePct: number;
}

export interface BroadcasterPlayerDetails {
  playerId: string;
  card: PlayerCardData | null;
  averages: BroadcasterPlayerAverages | null;
  gameRecord: BroadcasterPlayerRecord | null;
}

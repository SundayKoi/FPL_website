import type { LolRole } from "@/lib/draft/types";
import type { FixtureRow } from "@/lib/schedule/types";
import type { DraftSide, MatchDraftAction, MatchDraftPositions } from "@/lib/match-draft/types";
import type { DraftMatchupView } from "@/lib/match-draft/presentation";
import type { IngestedScoutingData, IngestedScoutingGame, IngestedScoutingCoverage, InhousePlayerStats } from "./inhouse";

export type ScoutScope = "recent" | "season" | "all";
export interface ScoutFixtureRow { id: string; season: string; stage: FixtureRow["stage"]; team_a: string | null; team_b: string | null; scheduled_at: string | null; best_of: FixtureRow["best_of"]; score_a: number | null; score_b: number | null; }
export interface ScoutDraftRow { id: string; fixture_id: string; game_number: number; blue_team_name: string | null; red_team_name: string | null; winner_team: string | null; actions: MatchDraftAction[]; positions: MatchDraftPositions | null; created_at: string; }
export interface ScoutRosterPlayer { id: string; displayName: string; role: LolRole; opggUrl?: string | null; }
export interface ScoutHistory { fixtures: ScoutFixtureRow[]; drafts: ScoutDraftRow[]; }
export type ScoutingIngestionStatus = "available" | "unavailable";
export interface ScoutSource extends ScoutHistory {
  opponentName: string;
  /** Team whose roster the source roster represents. */
  teamName?: string;
  /** Existing team crest, when the current card identity has one. */
  teamImageUrl?: string | null;
  currentSeason: string;
  nextFixture?: ScoutFixtureRow;
  roster: ScoutRosterPlayer[];
  /** Successful Riot read: matched rows plus raw coverage for unresolved participants. */
  ingestedScouting?: IngestedScoutingData;
  /** Explicitly distinguishes a failed read from a successful empty read. */
  ingestedScoutingStatus?: ScoutingIngestionStatus;
  /** Legacy in-memory source shape retained for existing callers and fixtures. */
  ingestedGames?: IngestedScoutingGame[];
  ingestedCoverage?: IngestedScoutingCoverage[];
  inhousePlayerStats?: InhousePlayerStats[];
}
export interface ChampionCount { champion: string; count: number; rate?: number; }
export interface DraftSlot { champion: string | null; skipped: boolean; playerName?: string | null; }
export interface FullDraftSide { teamName: string | null; picks: DraftSlot[]; banPhaseOne: DraftSlot[]; banPhaseTwo: DraftSlot[]; }
export interface PastDraft { fixture: ScoutFixtureRow; gameNumber: number; side: DraftSide; winnerTeam: string | null; blue: FullDraftSide; red: FullDraftSide; matchup?: DraftMatchupView; }
export interface PlayerPoolRow {
  playerId: string;
  playerName: string;
  role: LolRole;
  champions: ChampionCount[];
  distinctChampions: number;
  totalPicks: number;
  gamesSampled: number;
  riotConfirmedPicks: number;
  draftOnlyPicks: number;
}
export interface SideFacts { side: DraftSide; games: number; commonOpening: ChampionCount | null; }
export interface AdaptationFacts { lossesFollowed: number; changedFirstPick: number; repeatedChampions: number; }
export interface FlexFact { champion: string; roles: string[]; }
export interface ScopedScoutData {
  gamesSampled: number;
  blueGames: number;
  distinctChampions: number;
  firstPicks: ChampionCount[];
  bannedAgainst: ChampionCount[];
  banPhaseOne: ChampionCount[];
  banPhaseTwo: ChampionCount[];
  openings: ChampionCount[];
  pairings: ChampionCount[];
  sideFacts: SideFacts[];
  adaptation: AdaptationFacts;
  flexes: FlexFact[];
  playerPools: PlayerPoolRow[];
  pastDrafts: PastDraft[];
  ingestionAvailable: boolean;
  unresolvedIngestedGames: number;
}

import type {
  DraftGameInfo,
  MatchCode,
  MyResultsData,
  MyRosterData,
} from "@/lib/captain/queries";
import type { LeagueTeam } from "@/lib/matches/types";
import type { LeagueKey } from "@/lib/players/identity";
import type { FixtureRow } from "@/lib/schedule/types";

export type MyTeamSignedOut = {
  kind: "signed-out";
  season: string;
};

export type MyTeamUnlinked = {
  kind: "unlinked";
  season: string;
};

export type MyTeamPending = {
  kind: "pending";
  season: string;
  linkId: string;
  playerPoolId: string;
  leagueTeamId: string | null;
};

export type MyTeamUnrostered = {
  kind: "unrostered";
  season: string;
  playerPoolId: string | null;
};

export type MyTeamRoster = MyRosterData & {
  multiOpggUrl: string | null;
};

export type MyTeamOpponent = {
  team: LeagueTeam | null;
  name: string;
  roster: MyRosterData | null;
  multiOpggUrl: string | null;
  /** Only opponent enrichment is optional. Core team data failures throw. */
  scoutingUnavailable: boolean;
};

export type MyTeamReadyDashboard = {
  kind: "ready";
  league: LeagueKey;
  profileId: string;
  playerPoolId: string | null;
  season: string;
  team: LeagueTeam;
  /** League-scoped teams, including inactive rows needed for historical name resolution. */
  teams: LeagueTeam[];
  /** Human-selectable teams. Admin overrides are validated only against this list. */
  activeTeams: LeagueTeam[];
  nextFixture: FixtureRow | null;
  codes: MatchCode[];
  draftGames: DraftGameInfo[];
  schedule: FixtureRow[];
  roster: MyTeamRoster;
  opponent: MyTeamOpponent | null;
  results: MyResultsData;
  /** True only when the caller captains the exact team in this result. */
  isCaptain: boolean;
  isAdmin: boolean;
};

export type MyTeamDashboardResult =
  | MyTeamSignedOut
  | MyTeamUnlinked
  | MyTeamPending
  | MyTeamUnrostered
  | MyTeamReadyDashboard;

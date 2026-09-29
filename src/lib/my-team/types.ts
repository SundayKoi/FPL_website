import type {
  DraftGameInfo,
  MatchCode,
  MyResultsData,
  MyRosterData,
} from "@/lib/captain/queries";
import type { LeagueTeam } from "@/lib/matches/types";
import type { LeagueKey } from "@/lib/players/identity";
import type { FixtureRow } from "@/lib/schedule/types";
import type { TeamAggRow } from "@/lib/stats/types";

export type MyTeamSignedOut = {
  kind: "signed-out";
  season: string;
};

export type MyTeamUnlinked = {
  kind: "unlinked";
  season: string;
  availableTeams: LeagueTeam[];
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

export type MyTeamBrand = {
  imageUrl: string | null;
  bannerColor: string;
};

export type MyTeamOpponent = {
  team: LeagueTeam | null;
  name: string;
  roster: MyRosterData | null;
  multiOpggUrl: string | null;
  /** Only opponent enrichment is optional. Core team data failures throw. */
  scoutingUnavailable: boolean;
  stats: TeamAggRow | null;
  statsUnavailable: boolean;
};

export type MyTeamReadyDashboard = {
  kind: "ready";
  league: LeagueKey;
  profileId: string;
  playerPoolId: string | null;
  season: string;
  team: LeagueTeam & MyTeamBrand;
  /** League-scoped teams, including inactive rows needed for historical name resolution. */
  teams: LeagueTeam[];
  /** Human-selectable teams. Admin overrides are validated only against this list. */
  activeTeams: LeagueTeam[];
  nextFixture: FixtureRow | null;
  /** Every fixture in this league's season, so a report can be linked to the
   *  match it describes even when that is not the team's next one — a
   *  corrected series whose fixture already carries a score, or an admin
   *  filing for two other teams. */
  fixtures: FixtureRow[];
  /** A confirmed Premier quarterfinal winner while both semifinal slots remain TBD. */
  awaitingPlayoffDraw?: boolean;
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

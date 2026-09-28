import Link from "next/link";
import CountUp from "./CountUp";
import type { HomeStandingTeam } from "@/lib/home/standings";
import type { HomeAppearance } from "./appearance";
import type { TeamIdentity } from "@/lib/teams/identity";
import { teamSlug } from "@/lib/teams/teamPage";
import styles from "./HomeWorkspace.module.css";
import TeamLogo from "./TeamLogo";

/** W/L dots for a team's recent series, oldest first. */
function FormDots({ form }: { form: ("W" | "L")[] }) {
  if (form.length === 0) return null;
  return (
    <span className="flex items-center gap-1" aria-label={`Recent form: ${form.join(", ")}`}>
      {form.map((result, index) => (
        <span
          key={index}
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full ${result === "W" ? "bg-success" : "bg-danger/80"}`}
        />
      ))}
    </span>
  );
}

function StandingRow({
  team,
  hasHistoricalStats,
  rank,
  appearance,
}: {
  team: HomeStandingTeam;
  hasHistoricalStats: boolean;
  rank: number;
  appearance: HomeAppearance;
}) {
  const isLeader = rank === 1;

  return (
    <div
      tabIndex={0}
      className={`group border-t border-border-subtle/50 py-3 transition first:border-t-0 first:pt-0 last:pb-0 hover:bg-border-subtle/15 focus-visible:bg-border-subtle/15 focus-visible:outline-none ${
        isLeader ? "row-rank-1" : ""
      }`}
    >
      <div className="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)_auto_auto_auto] items-center gap-2">
        {/* Standings rank -- the list arrives sorted by record
            (deriveSeriesStandings), so position is the rank. The team's
            nomination_position is its DRAFT slot, not standings rank. */}
        <span className={`font-mono text-xs font-semibold ${isLeader ? "text-prestige" : "text-muted"}`}>
          #{rank}
        </span>
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 font-mono text-xs text-league-accent">{team.abbreviation}</span>
          <span className={`min-w-0 truncate text-sm font-semibold ${appearance === "workspace" ? styles.ink : "text-white"}`}>{team.name}</span>
        </div>
        <FormDots form={team.form ?? []} />
        <span className="whitespace-nowrap font-mono text-sm font-semibold text-muted">
          {team.wins}–{team.losses}
        </span>
        {hasHistoricalStats ? (
          <CountUp
            value={team.winrate_pct ?? 0}
            suffix="%"
            className="whitespace-nowrap font-mono text-xs font-semibold text-success"
          />
        ) : null}
      </div>
      {team.next_opponent || (team.game_wins ?? 0) + (team.game_losses ?? 0) > 0 ? (
        <p className="hidden pl-[1.75rem] pt-1 font-mono text-[11px] text-muted group-hover:block group-focus-visible:block">
          {/* The game record is the first tiebreaker after the series record,
              so two teams showing the same W-L are ordered on a number that
              is otherwise nowhere on the page. */}
          {(team.game_wins ?? 0) + (team.game_losses ?? 0) > 0 ? (
            <span>
              <span className="text-league-accent">Games</span> {team.game_wins}–{team.game_losses}
              {team.next_opponent ? " · " : ""}
            </span>
          ) : null}
          {team.next_opponent ? (
            <span>
              <span className="text-league-accent">Next</span> vs {team.next_opponent}
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function divisionGroups(teams: HomeStandingTeam[]): { name: string; teams: HomeStandingTeam[] }[] {
  const grouped = new Map<string, HomeStandingTeam[]>();
  for (const team of teams) {
    const division = team.division?.trim();
    if (!division) return [];
    grouped.set(division, [...(grouped.get(division) ?? []), team]);
  }

  return Array.from(grouped, ([name, groupedTeams]) => ({ name, teams: groupedTeams }));
}

function workspaceDivisionGroups(teams: HomeStandingTeam[]): { name: string; teams: HomeStandingTeam[] }[] {
  const grouped = new Map<string, HomeStandingTeam[]>();
  for (const team of teams) {
    const name = team.division?.trim() || "Division unassigned";
    grouped.set(name, [...(grouped.get(name) ?? []), team]);
  }
  return Array.from(grouped, ([name, groupedTeams]) => ({ name, teams: groupedTeams }));
}

function WorkspaceTable({
  group,
  identities,
  teamBasePath,
}: {
  group: { name: string; teams: HomeStandingTeam[] };
  identities: Record<string, TeamIdentity>;
  teamBasePath: string | null;
}) {
  const captionId = `home-standings-${group.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-title`;
  return (
    <section role="group" aria-labelledby={captionId} className={styles.standingsDivision}>
      <h3 id={captionId} className={styles.divisionTitle}>{group.name}</h3>
      <table className={styles.standingsTable}>
        <caption className="sr-only">{group.name} team standings</caption>
        <thead>
          <tr>
            <th scope="col" aria-label="Rank">#</th>
            <th scope="col">Team</th>
            <th scope="col" aria-label="Series wins">W</th>
            <th scope="col" aria-label="Series losses">L</th>
          </tr>
        </thead>
        <tbody>
          {group.teams.map((team, index) => {
            const identity = identities[teamSlug(team.name)];
            const recordAvailable = Number.isFinite(team.wins) && Number.isFinite(team.losses);
            const gameRecordAvailable = Number.isFinite(team.game_wins) && Number.isFinite(team.game_losses) &&
              (team.game_wins ?? 0) + (team.game_losses ?? 0) > 0;
            return (
              <tr key={team.id}>
                <td className={styles.standingRank}>{index + 1}</td>
                <td className={styles.standingTeam}>
                  <div className={styles.standingTeamMain}>
                    <TeamLogo name={team.name} identity={identity} className={styles.standingLogo} fallbackClassName={styles.standingFallback} />
                    {teamBasePath ? (
                      <Link href={`${teamBasePath}/${teamSlug(team.name)}`} className={styles.standingTeamLink}>{team.name}</Link>
                    ) : <span className={styles.standingTeamName}>{team.name}</span>}
                  </div>
                  <span className={styles.standingContext}>
                    {gameRecordAvailable ? <span>Games {team.game_wins}–{team.game_losses}</span> : null}
                    {team.next_opponent ? <span>{gameRecordAvailable ? " · " : ""}Next: {team.next_opponent}</span> : null}
                    {team.form?.length ? <span>{gameRecordAvailable || team.next_opponent ? " · " : ""}Form {team.form.join("–")}</span> : null}
                    {typeof team.winrate_pct === "number" ? <span>{gameRecordAvailable || team.next_opponent || team.form?.length ? " · " : ""}{team.winrate_pct}% series win rate</span> : null}
                  </span>
                </td>
                <td className={styles.standingRecord}>{recordAvailable ? team.wins : "—"}</td>
                <td className={styles.standingRecord}>{recordAvailable ? team.losses : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function WorkspaceStandings({
  teams,
  identities,
  standingsHref,
  teamBasePath,
  seasonLabel,
  standalone,
}: {
  teams: HomeStandingTeam[];
  identities: Record<string, TeamIdentity>;
  standingsHref: string;
  teamBasePath: string | null;
  seasonLabel: string;
  standalone: boolean;
}) {
  const groups = workspaceDivisionGroups(teams);
  return (
    <article aria-labelledby="home-standings-title" className={styles.openSection} data-appearance="workspace">
      <div className={styles.sectionHeading}>
        <div>
          <span className={styles.eyebrow}>{standalone ? "RANKED BY SERIES RECORD" : `${seasonLabel} · LEAGUE STANDINGS`}</span>
          <h2 id="home-standings-title" className={`${styles.title} mt-2 text-2xl sm:text-3xl`}>{standalone ? "Team standings" : "Standings"}</h2>
        </div>
        {!standalone ? <Link href={standingsHref} className={styles.link}>View full league <span aria-hidden>→</span></Link> : null}
      </div>
      {groups.length === 0 ? (
        <p className={`${styles.muted} py-4 text-sm`}>Standings will appear once the {seasonLabel} teams are configured.</p>
      ) : (
        <div className={styles.standingsGroups}>
          {groups.map((group) => <WorkspaceTable key={group.name} group={group} identities={identities} teamBasePath={teamBasePath} />)}
        </div>
      )}
    </article>
  );
}

export default function HomeStandings({
  teams,
  seasonLabel,
  identities = {},
  standingsHref = "/standings",
  teamBasePath = "/teams",
  appearance = "legacy",
  standalone = false,
}: {
  teams: HomeStandingTeam[];
  /** The league's season code. Academy and Premier run different ones, so the
   *  copy here is passed in rather than hardcoded to Premier's. */
  seasonLabel?: string;
  identities?: Record<string, TeamIdentity>;
  standingsHref?: string;
  teamBasePath?: string | null;
  appearance?: HomeAppearance;
  standalone?: boolean;
}) {
  const workspace = appearance === "workspace";
  if (workspace) {
    return (
      <WorkspaceStandings
        teams={teams}
        identities={identities}
        standingsHref={standingsHref}
        teamBasePath={teamBasePath}
        seasonLabel={seasonLabel?.trim() || "Season"}
        standalone={standalone}
      />
    );
  }
  const hasHistoricalStats = teams.some((team) => team.winrate_pct !== undefined);
  const season = seasonLabel?.trim() || "S5";
  const groups = divisionGroups(teams);

  return (
    <article
      aria-labelledby="home-standings-title"
      className={workspace ? `${styles.panel} flex min-h-0 flex-col overflow-hidden p-5 sm:p-6` : "card-brand flex min-h-0 flex-col overflow-hidden p-5 sm:p-6"}
      data-appearance={appearance}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={workspace ? styles.eyebrow : "label-dash"}>TEAM STANDINGS</span>
          <h2 id="home-standings-title" className={workspace ? `${styles.title} mt-2 text-3xl sm:text-4xl` : "type-display mt-2 text-3xl sm:text-4xl"}>
            Team standings
          </h2>
        </div>
        <span className="shrink-0 rounded-full border border-league-accent/40 bg-league-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-league-accent">
          {hasHistoricalStats ? `${season} standings` : "0–0 start"}
        </span>
      </div>

      {teams.length === 0 ? (
          <p className={`mt-5 text-sm leading-6 ${workspace ? styles.muted : "text-muted"}`}>
          Standings will appear once the {season} teams are configured.
        </p>
      ) : (
        <div className="mt-5 flex flex-col">
          {groups.length > 0
            ? groups.map((group) => (
                <section
                  key={group.name}
                  role="group"
                  aria-labelledby={`home-standings-${group.name.toLowerCase()}-title`}
                  className="border-t border-border-subtle/60 py-4 first:border-t-0 first:pt-0 last:pb-0"
                >
                  <h3
                    id={`home-standings-${group.name.toLowerCase()}-title`}
                    className={workspace ? `${styles.divisionTitle} mb-2` : "mb-2 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-league-accent"}
                  >
                    {group.name} division
                  </h3>
                  <div className="flex flex-col">
                    {group.teams.map((team, index) => (
                      <StandingRow
                        key={team.id}
                        team={team}
                        hasHistoricalStats={hasHistoricalStats}
                        rank={index + 1}
                        appearance={appearance}
                      />
                    ))}
                  </div>
                </section>
              ))
            : teams.map((team, index) => (
              <StandingRow key={team.id} team={team} hasHistoricalStats={hasHistoricalStats} rank={index + 1} appearance={appearance} />
              ))}
        </div>
      )}
    </article>
  );
}

import type { ReactNode } from "react";
import type { RosterTeamView } from "@/lib/draft/types";
import type { RosterClaimTarget } from "@/lib/teams/rosterClaims";
import { DIVISIONS, type Division } from "@/lib/schedule/types";
import LeaguePageShell from "@/components/league/LeaguePageShell";
import TeamRosterCard from "./TeamRosterCard";
import styles from "./TeamsDirectory.module.css";

type LeagueView = "premier" | "academy";

export default function TeamsDirectory({
  draftName,
  isPreview,
  teams,
  league = "premier",
  adminControls,
  rosterContent,
  playerClaims = {},
}: {
  draftName: string | null;
  isPreview: boolean;
  teams: RosterTeamView[];
  league?: LeagueView;
  adminControls?: ReactNode;
  rosterContent?: ReactNode;
  playerClaims?: Record<string, RosterClaimTarget>;
}) {
  const isAcademy = league === "academy";
  const leagueLabel = isAcademy ? "Academy" : "Premier";
  const sections: { label: string; division: Division | null }[] = [
    { label: DIVISIONS[1], division: DIVISIONS[1] },
    { label: DIVISIONS[0], division: DIVISIONS[0] },
    { label: "Unassigned", division: null },
  ];

  return (
    <LeaguePageShell
      league={league}
      title={`${leagueLabel} teams`}
      season={draftName}
      activeSection="teams"
      description={
        isPreview
          ? `Preview the ${leagueLabel.toLowerCase()} roster format with placeholder names and positions.`
          : `Teams and player rosters for ${draftName ?? `the selected ${leagueLabel.toLowerCase()} draft`}.`
      }
    >
      {isPreview ? (
        <p className={styles.previewNotice}>
          <strong>Preview data.</strong> Team names and player positions are placeholders.
        </p>
      ) : null}

      <section aria-label="Team rosters" className={styles.directory}>
        {sections.map((section) => {
          const sectionTeams = teams.filter((team) => (team.division ?? null) === section.division);
          if (!sectionTeams.length) return null;
          return (
            <section key={section.label} aria-labelledby={`division-${section.label}`} className={styles.division}>
              <h2 id={`division-${section.label}`} className={styles.divisionTitle}>{section.label}</h2>
              <div className={styles.teamGrid}>
                {sectionTeams.map((team) => (
                  <TeamRosterCard
                    key={team.id}
                    team={team}
                    league={league}
                    appearance="league"
                    playerClaims={playerClaims}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </section>

      {adminControls || rosterContent ? (
        <details className={styles.management}>
          <summary>Team management</summary>
          {adminControls ? <div className={styles.managementControls}>{adminControls}</div> : null}
          {rosterContent ? <div className={styles.managementEditor}>{rosterContent}</div> : null}
        </details>
      ) : null}
    </LeaguePageShell>
  );
}

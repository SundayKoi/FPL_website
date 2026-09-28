import Link from "next/link";
import { DIVISIONS, FIXTURE_STAGES, type FixtureRow, type FixtureStage } from "@/lib/schedule/types";
import { formatKickoff, hasResult, stageMeta } from "@/lib/schedule/format";
import { normalizeTeamName } from "@/lib/league/context";
import { teamSlug } from "@/lib/teams/teamPage";
import type { TeamIdentity } from "@/lib/teams/identity";
import type { HomepagePlayoffSeed, HomepagePlayoffSeedingMode, HomepagePlayoffSeeds } from "@/lib/home/standings";
import TeamLogo from "./TeamLogo";
import styles from "./HomeWorkspace.module.css";

const PLAYOFF_STAGES = FIXTURE_STAGES.filter((stage) => stageMeta(stage).group !== "Regular Season");

type HomePlayoffBracketProps = {
  season: string | null | undefined;
  activeStage: FixtureStage | null;
  fixtures: FixtureRow[];
  seeds?: HomepagePlayoffSeeds;
  overallSeeds?: HomepagePlayoffSeed[];
  seedMode?: HomepagePlayoffSeedingMode;
  identities: Record<string, TeamIdentity>;
  scheduleHref: string;
  teamBasePath?: string | null;
};

export default function HomePlayoffBracket({
  season,
  activeStage,
  fixtures,
  seeds,
  overallSeeds,
  seedMode = "divisions",
  identities,
  scheduleHref,
  teamBasePath = "/teams",
}: HomePlayoffBracketProps) {
  const seasonFixtures = season ? fixtures.filter((fixture) => fixture.season === season) : fixtures;
  const regularSeasonResults = seasonFixtures.filter((fixture) =>
    stageMeta(fixture.stage).group === "Regular Season" && hasResult(fixture),
  );
  const divisionsWithRegularSeasonResults = new Set(
    regularSeasonResults
      .filter((fixture) => fixture.score_a !== fixture.score_b && fixture.division)
      .map((fixture) => fixture.division as (typeof DIVISIONS)[number]),
  );
  const hasRegularSeasonResults = seedMode === "league-wide"
    ? regularSeasonResults.some((fixture) => fixture.score_a !== fixture.score_b)
    : divisionsWithRegularSeasonResults.size > 0;
  const regularSeasonComplete = activeStage === null || stageMeta(activeStage).group !== "Regular Season";
  const seedByName = new Map<string, HomepagePlayoffSeed>();

  if (seedMode === "league-wide") {
    if (hasRegularSeasonResults) {
      for (const seed of overallSeeds ?? []) {
        seedByName.set(normalizeTeamName(seed.name), seed);
      }
    }
  } else {
    for (const division of DIVISIONS) {
      if (!divisionsWithRegularSeasonResults.has(division)) continue;
      for (const seed of seeds?.[division] ?? []) {
        seedByName.set(normalizeTeamName(seed.name), seed);
      }
    }
  }

  const renderSeedList = (divisionSeeds: HomepagePlayoffSeed[]) => (
    <ol className={styles.seedList}>
      {divisionSeeds.map((seed) => {
        const identity = identities[teamSlug(seed.name)];
        const content = <>
          <span className={styles.seedNumber}>#{seed.seed}</span>
          <TeamLogo name={seed.name} identity={identity} className={styles.seedLogo} fallbackClassName={styles.seedFallback} />
          <span className={styles.seedName}>{seed.name}</span>
        </>;
        return (
          <li className={styles.seedItem} key={seed.id}>
            {teamBasePath
              ? <Link className={styles.seedTeamLink} href={`${teamBasePath}/${teamSlug(seed.name)}`}>{content}</Link>
              : <div className={styles.seedTeamLink}>{content}</div>}
          </li>
        );
      })}
    </ol>
  );

  const rounds = PLAYOFF_STAGES.flatMap((stage) => {
    const rows = seasonFixtures
      .filter((fixture) => fixture.stage === stage)
      .sort((a, b) => a.sort_order - b.sort_order);
    return rows.length > 0 ? [{ stage, meta: stageMeta(stage), fixtures: rows }] : [];
  });

  return (
    <section className={styles.bracketSection} aria-labelledby="home-playoff-bracket-title">
      <header className={styles.bracketHeader}>
        <div>
          <p className={styles.bracketEyebrow}>{season ?? "FPL"} · POSTSEASON</p>
          <h2 id="home-playoff-bracket-title">Playoff bracket</h2>
          <p className={styles.bracketDescription}>
            Seeds and scheduled matchups, with each series advancing toward the title.
          </p>
        </div>
        <Link href={scheduleHref} className={styles.bracketScheduleLink}>Full schedule <span aria-hidden="true">→</span></Link>
      </header>

      <div className={styles.playoffField}>
        <div className={styles.playoffFieldHeading}>
          <h3>Seed order</h3>
          <span className={styles.seedStatus}>
            {hasRegularSeasonResults
              ? regularSeasonComplete ? "Final seeds" : "Projected seeds"
              : "Waiting for results"}
          </span>
        </div>
        <div className={styles.seedDivisions}>
          {seedMode === "league-wide" ? (
            <section className={styles.seedDivision} aria-label="Academy playoff seeds">
              <h4>Academy</h4>
              {hasRegularSeasonResults && overallSeeds && overallSeeds.length > 0
                ? renderSeedList(overallSeeds)
                : <p className={styles.seedEmpty}>Seeds will appear after regular-season results are reported.</p>}
            </section>
          ) : DIVISIONS.map((division) => {
            const divisionSeeds = seeds?.[division] ?? [];
            const divisionHasResults = divisionsWithRegularSeasonResults.has(division);
            return (
              <section className={styles.seedDivision} key={division} aria-label={`${division} playoff seeds`}>
                <h4>{division}</h4>
                {divisionHasResults && divisionSeeds.length > 0
                  ? renderSeedList(divisionSeeds)
                  : <p className={styles.seedEmpty}>Seeds will appear after regular-season results are reported.</p>}
              </section>
            );
          })}
        </div>
      </div>

      {rounds.length > 0 ? (
        <>
          <p className={styles.bracketScrollHint}>Scroll horizontally to follow each round <span aria-hidden="true">→</span></p>
          <div className={styles.bracketScroller} role="region" aria-label="Playoff rounds, from gauntlet through finals" tabIndex={0}>
            <div className={styles.bracketBoard}>
              {rounds.map(({ stage, meta, fixtures: roundFixtures }, index) => (
                <div className={styles.bracketRoundGroup} key={stage}>
                  <section className={styles.bracketRound} aria-label={`${meta.label} round`}>
                    <ol className={styles.bracketFixtureList}>
                      {roundFixtures.map((fixture) => (
                        <li key={fixture.id}>
                          <BracketMatchup
                            fixture={fixture}
                            seedByName={seedByName}
                            identities={identities}
                            teamBasePath={teamBasePath}
                          />
                        </li>
                      ))}
                    </ol>
                  </section>
                  {index < rounds.length - 1 ? <span className={styles.bracketAdvance} aria-hidden="true">→</span> : null}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className={styles.bracketEmpty}>
          <strong>Playoff matchups haven&apos;t been posted yet.</strong>
          <span>The bracket will fill in when the league schedule is seeded.</span>
        </div>
      )}
    </section>
  );
}

function BracketMatchup({
  fixture,
  seedByName,
  identities,
  teamBasePath,
}: {
  fixture: FixtureRow;
  seedByName: Map<string, HomepagePlayoffSeed>;
  identities: Record<string, TeamIdentity>;
  teamBasePath: string | null;
}) {
  const result = hasResult(fixture);
  const aWon = result && fixture.score_a > fixture.score_b;
  const bWon = result && fixture.score_b > fixture.score_a;
  const winner = aWon ? fixture.team_a : bWon ? fixture.team_b : null;
  const matchupName = `${fixture.team_a ?? "TBD"} vs ${fixture.team_b ?? "TBD"}`;

  return (
    <article className={styles.bracketMatch} aria-label={`${stageMeta(fixture.stage).label}: ${matchupName}`}>
      <div className={styles.bracketMatchTopline}>
        <span>BO{fixture.best_of}</span>
        {result ? <span className={styles.bracketFinal}>FINAL</span> : <span>{formatKickoff(fixture.scheduled_at)}</span>}
      </div>
      <BracketTeamSlot
        name={fixture.team_a}
        score={result ? fixture.score_a : null}
        isWinner={Boolean(winner && winner === fixture.team_a)}
        seed={fixture.team_a ? seedByName.get(normalizeTeamName(fixture.team_a)) : undefined}
        identity={fixture.team_a ? identities[teamSlug(fixture.team_a)] : undefined}
        teamBasePath={teamBasePath}
      />
      <BracketTeamSlot
        name={fixture.team_b}
        score={result ? fixture.score_b : null}
        isWinner={Boolean(winner && winner === fixture.team_b)}
        seed={fixture.team_b ? seedByName.get(normalizeTeamName(fixture.team_b)) : undefined}
        identity={fixture.team_b ? identities[teamSlug(fixture.team_b)] : undefined}
        teamBasePath={teamBasePath}
      />
    </article>
  );
}

function BracketTeamSlot({
  name,
  score,
  isWinner,
  seed,
  identity,
  teamBasePath,
}: {
  name: string | null;
  score: number | null;
  isWinner: boolean;
  seed?: HomepagePlayoffSeed;
  identity?: TeamIdentity;
  teamBasePath: string | null;
}) {
  const content = <>
    <span className={`${styles.bracketTeamSlot} ${isWinner ? styles.bracketWinner : ""}`}>
      {seed ? <span className={styles.bracketSeed}>{seed.division ? `${seed.division} ` : ""}#{seed.seed}</span> : null}
      <span className={styles.bracketTeamIdentity}>
        <TeamLogo name={name} identity={identity} className={styles.bracketLogo} fallbackClassName={styles.bracketFallback} />
        <span className={styles.bracketTeamName}>{name ?? "TBD"}</span>
      </span>
      {score !== null ? <span className={styles.bracketScore}>{score}</span> : null}
    </span>
  </>;

  if (!name || !teamBasePath) return <div className={styles.bracketTeamLink}>{content}</div>;
  return <Link className={styles.bracketTeamLink} href={`${teamBasePath}/${teamSlug(name)}`}>{content}</Link>;
}

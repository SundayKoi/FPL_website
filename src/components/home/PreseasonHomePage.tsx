import { DRAFT_DAY_AT, DRAFT_DAY_LABEL } from "@/lib/home/seasonState";
import { fetchPreseasonHomeData } from "@/lib/home/preseason";
import PreseasonCountdown from "./PreseasonCountdown";
import PreseasonPlayerPool from "./PreseasonPlayerPool";
import SiteDirectoryGrid from "./SiteDirectoryGrid";
import styles from "./HomeWorkspace.module.css";

export default async function PreseasonHomePage() {
  const data = await fetchPreseasonHomeData();

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.content}>
        <section aria-labelledby="preseason-home-title" className={`${styles.panel} overflow-hidden p-5 sm:p-8 xl:p-10`}>
          <div className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
            <div>
              <span className={styles.eyebrow}>SEASON 5 · PRESEASON BRIEFING</span>
              <h1 id="preseason-home-title" className={`${styles.title} mt-3 max-w-4xl text-5xl sm:text-7xl`}>
                The draft room is almost open.
              </h1>
              <p className={`mt-5 max-w-2xl text-lg leading-8 ${styles.muted}`}>
                The league is getting ready for another season. Watch the board, track every franchise&apos;s remaining budget, and get familiar with the players still available.
              </p>
              <PreseasonCountdown targetAt={DRAFT_DAY_AT} appearance="workspace" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className={`${styles.softPanel} p-4`}>
                <span className={styles.eyebrow}>DRAFT DAY</span>
                <p className={`mt-2 text-xl font-semibold ${styles.ink}`}>{DRAFT_DAY_LABEL}</p>
                <p className={`mt-1 text-sm leading-6 ${styles.muted}`}>The Season 5 draft goes live.</p>
              </div>
                <div className={`${styles.softPanel} p-4`}>
                <span className={styles.eyebrow}>FIRST GAME</span>
                <p className={`mt-2 text-xl font-semibold ${styles.ink}`}>Monday, August 17</p>
                <p className={`mt-1 text-sm leading-6 ${styles.muted}`}>The regular season begins.</p>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="preseason-teams-title">
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.eyebrow}>FRANCHISE CHECK-IN</span>
              <h2 id="preseason-teams-title" className={`${styles.title} mt-2 text-4xl sm:text-5xl`}>The room at a glance</h2>
            </div>
            <p className={`max-w-sm text-right text-sm leading-6 ${styles.muted}`}>
              {data.draftName ? `${data.draftName} · ` : ""}Points remaining before the auction starts.
            </p>
          </div>

          {data.teams.length === 0 ? (
            <p className={`${styles.panel} mt-4 p-4 text-sm ${styles.muted}`}>Team budgets will appear here once the featured draft is published.</p>
          ) : (
            <div className={styles.budgetGrid}>
              {data.teams.map((team) => {
                const remainingPercent = Math.max(0, Math.min(100, (team.pointsRemaining / Math.max(team.budgetStart, 1)) * 100));
                return (
                  <article key={team.id} className={styles.budgetRow}>
                    <div className={styles.budgetTeam}>
                      <span aria-hidden className={styles.budgetAccent} style={{ backgroundColor: team.bannerColor }} />
                      <div className="min-w-0">
                        <span className={`font-mono text-xs font-semibold ${styles.muted}`}>#{team.nominationPosition} · {team.abbreviation}</span>
                        <h3 className={`mt-0.5 break-words text-base font-semibold ${styles.ink}`}>{team.name}</h3>
                        <p className={`text-xs ${styles.muted}`}>Captain {team.captainName}</p>
                      </div>
                    </div>
                    <div className={styles.budgetPoints}>
                      <div>
                        <span className={styles.eyebrow}>POINTS LEFT</span>
                        <p className={`font-mono text-xl font-bold ${styles.ink}`}>{team.pointsRemaining} pts left</p>
                      </div>
                      <span className={`text-xs ${styles.muted}`}>of {team.budgetStart} pts</span>
                    </div>
                    <div className={styles.budgetProgress}>
                      <div className={styles.budgetBar} role="progressbar" aria-label={`${team.name} points remaining`} aria-valuemin={0} aria-valuemax={team.budgetStart} aria-valuenow={team.pointsRemaining}>
                        <span style={{ width: `${remainingPercent}%` }} />
                      </div>
                      <div className={`mt-1 flex justify-between text-[10px] ${styles.muted}`}><span>Remaining budget</span><span>{remainingPercent}%</span></div>
                    </div>
                    <div className={styles.budgetRoster}>
                      <div className="flex items-center justify-between gap-3">
                        <span className={styles.eyebrow}>DRAFTED PLAYERS</span>
                        <span className={`text-xs ${styles.muted}`}>{team.rosterCount}/5</span>
                      </div>
                      {team.draftedPlayers.length > 0 ? (
                        <ul className={styles.budgetRosterList}>
                          {team.draftedPlayers.map((player) => (
                            <li key={player.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                              <span className={`break-words ${styles.ink}`}>
                                <span className={`mr-2 font-mono text-[10px] ${styles.muted}`}>{player.role.toUpperCase()}</span>
                                {player.displayName}
                              </span>
                              <span className="shrink-0 font-mono text-xs text-prestige">{player.price ?? 0} pts</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className={`mt-1 text-xs ${styles.muted}`}>No players drafted yet.</p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <PreseasonPlayerPool players={data.players} appearance="workspace" />

        <SiteDirectoryGrid league="premier" appearance="workspace" />

        <section aria-label="Preseason notes" className="grid gap-3 md:grid-cols-3">
          <div className={`${styles.softPanel} p-4`}><span className={styles.eyebrow}>01 · DRAFT DAY</span><p className={`mt-3 text-sm leading-6 ${styles.muted}`}>Join the draft room Saturday night and follow every nomination as the board takes shape.</p></div>
          <div className={`${styles.softPanel} p-4`}><span className={styles.eyebrow}>02 · PLAYER POOL</span><p className={`mt-3 text-sm leading-6 ${styles.muted}`}>Remaining players are clearly visible and sorted by rank. Captains stay pinned at the top of each role.</p></div>
          <div className={`${styles.softPanel} p-4`}><span className={styles.eyebrow}>03 · OPENING WEEK</span><p className={`mt-3 text-sm leading-6 ${styles.muted}`}>The first regular-season games begin Monday, August 17. The full league dashboard takes over then.</p></div>
        </section>
        </div>
      </div>
    </main>
  );
}

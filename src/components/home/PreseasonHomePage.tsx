import { DRAFT_DAY_AT } from "@/lib/home/seasonState";
import { fetchPreseasonHomeData } from "@/lib/home/preseason";
import PreseasonCountdown from "./PreseasonCountdown";
import PreseasonPlayerPool from "./PreseasonPlayerPool";
import LeaguePageToggle from "@/components/LeaguePageToggle";

export default async function PreseasonHomePage() {
  const data = await fetchPreseasonHomeData();

  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
        <section aria-labelledby="preseason-home-title" className="card-brand overflow-hidden p-5 sm:p-8 xl:p-10">
          <div className="mb-6 flex justify-end"><LeaguePageToggle page="home" view="premier" /></div>
          <div className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
            <div>
              <span className="label-dash">SEASON 5 · PRESEASON BRIEFING</span>
              <h1 id="preseason-home-title" className="type-display mt-3 max-w-4xl text-5xl sm:text-7xl">
                The draft room is almost open.
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-steel">
                The league is getting ready for another season. Watch the board, track every franchise&apos;s remaining budget, and get familiar with the players still available.
              </p>
              <PreseasonCountdown targetAt={DRAFT_DAY_AT} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-lg border border-gold/50 bg-gold/10 p-5">
                <span className="label-dash text-gold">DRAFT DAY</span>
                <p className="mt-3 text-xl font-semibold text-white">Saturday, August 15 · 8:00 PM EST</p>
                <p className="mt-2 text-sm leading-6 text-steel">The Season 5 draft goes live.</p>
              </div>
              <div className="rounded-lg border border-cyan/40 bg-cyan/10 p-5">
                <span className="label-dash text-cyan">FIRST GAME</span>
                <p className="mt-3 text-xl font-semibold text-white">Monday, August 17</p>
                <p className="mt-2 text-sm leading-6 text-steel">The regular season begins.</p>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="preseason-teams-title" className="mt-6 xl:mt-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="label-dash">FRANCHISE CHECK-IN</span>
              <h2 id="preseason-teams-title" className="type-display mt-2 text-4xl sm:text-5xl">The room at a glance</h2>
            </div>
            <p className="max-w-sm text-right text-sm leading-6 text-steel">
              {data.draftName ? `${data.draftName} · ` : ""}Points remaining before the auction starts.
            </p>
          </div>

          {data.teams.length === 0 ? (
            <p className="card-brand mt-5 p-5 text-sm text-steel">Team budgets will appear here once the featured draft is published.</p>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {data.teams.map((team) => (
                <article key={team.id} className="card-brand overflow-hidden">
                  <div className="h-2" style={{ backgroundColor: team.bannerColor }} />
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="font-mono text-xs font-semibold text-steel">#{team.nominationPosition} · {team.abbreviation}</span>
                        <h3 className="mt-2 text-xl font-semibold text-white">{team.name}</h3>
                        <p className="mt-1 text-xs uppercase tracking-[0.12em] text-steel">Captain {team.captainName}</p>
                      </div>
                      <span className="rounded-full border border-cyan/40 bg-cyan/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan">{team.rosterCount}/5</span>
                    </div>
                    <div className="mt-5 flex items-end justify-between gap-3">
                      <div>
                        <span className="label-dash">POINTS LEFT</span>
                        <p className="mt-1 font-mono text-3xl font-bold text-gold">{team.pointsRemaining} pts left</p>
                      </div>
                      <span className="text-xs text-steel">of {team.budgetStart} pts</span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
                      <div className="h-full rounded-full bg-gold" style={{ width: `${Math.max(0, Math.min(100, (team.pointsRemaining / Math.max(team.budgetStart, 1)) * 100))}%` }} />
                    </div>
                    <div className="mt-5 border-t border-line/60 pt-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="label-dash">DRAFTED PLAYERS</span>
                        <span className="text-xs text-steel">{team.rosterCount}/5</span>
                      </div>
                      {team.draftedPlayers.length > 0 ? (
                        <ul className="mt-2 space-y-2">
                          {team.draftedPlayers.map((player) => (
                            <li key={player.id} className="flex items-center justify-between gap-3 text-sm">
                              <span className="min-w-0 truncate font-semibold text-white">
                                <span className="mr-2 font-mono text-[10px] text-steel">{player.role.toUpperCase()}</span>
                                {player.displayName}
                              </span>
                              <span className="shrink-0 font-mono text-xs text-gold">{player.price ?? 0} pts</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-xs text-steel">No players drafted yet.</p>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <PreseasonPlayerPool players={data.players} />

        <section aria-label="Preseason notes" className="mt-6 grid gap-4 md:grid-cols-3 xl:mt-8">
          <div className="card-brand p-5"><span className="label-dash">01 · DRAFT DAY</span><p className="mt-3 text-sm leading-6 text-steel">Join the draft room Saturday night and follow every nomination as the board takes shape.</p></div>
          <div className="card-brand p-5"><span className="label-dash">02 · PLAYER POOL</span><p className="mt-3 text-sm leading-6 text-steel">Remaining players are clearly visible and sorted by rank. Captains stay pinned at the top of each role.</p></div>
          <div className="card-brand p-5"><span className="label-dash">03 · OPENING WEEK</span><p className="mt-3 text-sm leading-6 text-steel">The first regular-season games begin Monday, August 17. The full league dashboard takes over then.</p></div>
        </section>
      </div>
    </main>
  );
}

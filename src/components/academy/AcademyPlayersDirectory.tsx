import LeaguePageToggle from "@/components/LeaguePageToggle";
import type { AcademySheetPlayer } from "@/lib/academy/playerSheet";

const ROLE_ORDER = ["Top", "Jungle", "Mid", "Adc", "Support"];

export default function AcademyPlayersDirectory({ players }: { players: AcademySheetPlayer[] }) {
  const sections = ROLE_ORDER.map((role) => ({ role, players: players.filter((player) => player.role.toLowerCase() === role.toLowerCase()) }));
  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
        <header className="flex flex-col gap-6 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="label-dash">ACADEMY PLAYER POOL</span>
            <h1 className="type-display mt-3 text-5xl sm:text-6xl">Academy Players</h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-steel">Academy player names and OP.GG links from the current player sheet.</p>
          </div>
          <LeaguePageToggle page="players" view="academy" />
        </header>
        <section aria-label="Academy player directory" className="card-brand mt-10 overflow-x-auto p-4 sm:p-6">
          {!players.length ? <p className="text-steel">Academy player data is unavailable right now.</p> : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
              {sections.map((section) => (
                <section key={section.role} className="overflow-hidden rounded border border-line">
                  <h2 className="bg-panel px-4 py-3 text-lg font-bold uppercase tracking-wide">{section.role}</h2>
                  <ul>
                    {section.players.map((player) => (
                      <li key={player.name} className="border-t border-line px-4 py-3 text-sm">
                        {player.opggUrl ? (
                          <a href={player.opggUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline decoration-current/40 underline-offset-4 hover:text-white">
                            {player.name}
                          </a>
                        ) : <span className="font-semibold">{player.name}</span>}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

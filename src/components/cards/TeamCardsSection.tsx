// The roster plates, in a grid. One composite card per team, each rated by
// its five best player cards and painted in the team's own banner colour.
//
// The card itself lives in TeamCard; this is the gallery around it and the
// roster list beneath each one, which is where the numbers live — the card
// is the object, the list is the detail.

import { type PlayerCardData } from "@/lib/cards/build";
import { buildTeamCards } from "@/lib/cards/teamCards";
import TeamCard from "./TeamCard";

export default function TeamCardsSection({
  cards,
  colors,
  weekStart = "",
  showHeading = true,
}: {
  cards: PlayerCardData[];
  /** normalized team key -> banner colour, from fetchTeamIdentity. */
  colors?: Map<string, string>;
  /** The edition these plates read from — stamped onto any pulled copy. */
  weekStart?: string;
  /** false when the hosting page provides its own header (/cards/teams). */
  showHeading?: boolean;
}) {
  const teams = buildTeamCards(cards, colors, weekStart);
  if (teams.length === 0) return null;
  return (
    <section className="flex flex-col gap-4" aria-label="Team cards">
      {showHeading ? (
        <div>
          <span className="label-dash">Team cards</span>
          <p className="mt-1 text-sm text-steel">Rosters rated by their five best cards.</p>
        </div>
      ) : null}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {teams.map((team) => (
          <div key={team.teamName} className="flex flex-col gap-3">
            <TeamCard team={team} />
            <ul className="flex flex-col gap-1">
              {team.players.slice(0, 7).map((player) => (
                <li key={player.slug} className="flex items-center gap-2 text-sm">
                  <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-steel">
                    {player.role}
                  </span>
                  <a
                    href={`/card/${player.slug}`}
                    className="min-w-0 flex-1 truncate font-semibold text-white underline-offset-4 hover:text-coral hover:underline"
                  >
                    {player.name}
                  </a>
                  {player.standout ? (
                    <span title="Card of the Week" className="text-gold">
                      ★
                    </span>
                  ) : null}
                  <span
                    className="rounded border border-line px-1.5 font-mono text-xs font-bold"
                    style={{ color: team.bannerColor, filter: "brightness(1.5)" }}
                  >
                    {player.overall}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

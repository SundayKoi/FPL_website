import PlayerCard3D from "@/components/cards/PlayerCard3D";
import { cardPlayerKey, type PlayerCardData } from "@/lib/cards/build";
import { buildTeamCards, teamToCard } from "@/lib/cards/teamCards";
import type { AwardWinner, SeasonAward } from "@/lib/season-end/derive";

const format = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });

function unitFor(award: SeasonAward): string {
  if (award.unit === "gold") return "$";
  if (award.unit) return award.unit;
  if (award.id === "speedrunners") return "minutes";
  if (award.id === "fortress") return "towers/game";
  return "";
}

function winnerKey(name: string): string {
  const separator = name.lastIndexOf("#");
  return separator > 0 ? cardPlayerKey(name.slice(0, separator), name.slice(separator + 1)) : name.trim().toLowerCase();
}

function winnerNames(winner: AwardWinner): string[] {
  return winner.name.includes(" + ") ? winner.name.split(" + ") : [winner.name];
}

function decorateCard(card: PlayerCardData, award: SeasonAward, winner: AwardWinner): PlayerCardData {
  return {
    ...card,
    // Keep the normal rating, tier and stat bars. Only the copy on the card
    // changes: this award is what the card is being shown for today.
    archetype: award.title,
    motto: winner.detail ?? award.description,
    standout: false,
  };
}

/**
 * Season-end honors return to the first card treatment: the real player-card
 * renderer, including its champion art, rating, tier, stat bars and flip.
 * Season Cards remain the untouched normal renderer in the page below.
 */
export default function SeasonEndAwardCard({
  award,
  season,
  league,
  index,
  cards,
}: {
  award: SeasonAward;
  season: string;
  league: "premier" | "academy";
  index: number;
  cards: PlayerCardData[];
}) {
  const unit = unitFor(award);
  const cardsByPlayer = new Map(cards.map((card) => [cardPlayerKey(card.name, card.tag), card]));

  return (
    <article
      aria-labelledby={`title-${award.id}`}
      className="min-w-0 max-w-full"
    >
      <div className="mb-4 flex max-w-[20rem] flex-col gap-1">
        <div className="flex justify-between gap-2 font-mono text-[10px] uppercase tracking-widest text-steel">
          <span>{String(index + 1).padStart(2, "0")} / HONORS</span>
          <span>{season} · {league}</span>
        </div>
        <h3 id={`title-${award.id}`} className="type-display text-xl leading-tight text-gold">
          {award.title}
        </h3>
        <p className="text-xs leading-relaxed text-steel">{award.description}</p>
      </div>

      {award.winners.length ? (
        <div className="flex flex-col gap-8">
          {award.winners.map((winner, winnerIndex) => {
            const winnerCards = winnerNames(winner)
              .map((name) => cardsByPlayer.get(winnerKey(name)))
              .filter((card): card is PlayerCardData => Boolean(card));
            const teamCards = winner.name === winner.team
              ? cards.filter((card) => card.teamName?.trim().toLowerCase() === winner.team.trim().toLowerCase())
              : [];
            const candidateTeam = teamCards.length ? buildTeamCards(teamCards, undefined, season)[0] : null;
            const team = candidateTeam?.slots.every((slot) => slot.slug) ? candidateTeam : null;
            const renderedCards = team
              ? [teamToCard(team, season, 0)]
              : winnerCards.map((card) => decorateCard(card, award, winner));

            return (
              <div key={`${winner.name}-${winnerIndex}`}>
                <div className="mb-3 max-w-[20rem]">
                  <p className="break-words text-lg font-semibold">{winner.name}</p>
                  <p className="text-xs text-steel">
                    {winner.name !== winner.team ? `${winner.team} · ` : ""}
                    {winner.games} {award.id === "clean-sweep" ? "series" : "games"}
                  </p>
                  <p className="mt-2 break-words font-mono text-3xl font-black tracking-tighter text-gold">
                    {unit === "$" ? "$" : ""}{format(winner.value)}
                    {unit && unit !== "$" ? <span className="ml-2 text-sm font-normal text-steel">{unit}</span> : null}
                  </p>
                  {winner.detail ? <p className="mt-2 text-xs leading-relaxed text-steel">{winner.detail}</p> : null}
                </div>

                {renderedCards.length ? (
                  <div className="flex flex-wrap gap-5">
                    {renderedCards.map((card) => <PlayerCard3D key={card.slug} card={card} interactive />)}
                  </div>
                ) : (
                  <p className="card-brand max-w-[20rem] p-4 text-sm text-steel">No complete player-card stats are available for this winner.</p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card-brand max-w-[20rem] p-5">
          <p className="text-lg text-steel">{award.status === "unearned" ? "Not earned yet" : "Awaiting evidence"}</p>
          {award.note ? <p className="mt-2 text-xs text-steel">{award.note}</p> : null}
        </div>
      )}

      <p className="mt-4 max-w-[20rem] border-t border-line pt-3 font-mono text-[10px] uppercase tracking-widest text-steel">
        {award.winners.length > 1 ? `${award.winners.length} shared winners` : award.status === "ready" ? "Season leader" : "No winner declared"} · {league}
      </p>
    </article>
  );
}

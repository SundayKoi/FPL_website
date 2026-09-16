import { championSplashUrl } from "@/lib/match-draft/champions";
import { cardPlayerKey, type PlayerCardData } from "@/lib/cards/build";
import { buildTeamCards, teamToCard } from "@/lib/cards/teamCards";
import BestOfChampionCard from "./BestOfChampionCard";
import type { AwardWinner, SeasonAward } from "@/lib/season-end/derive";
import { formatAwardPresentation } from "@/lib/season-end/presentation";
import type { Division } from "@/lib/schedule/types";
import styles from "./SeasonEndAwardCard.module.css";

type AwardFamily = "record" | "guardian" | "wild" | "story" | "team";

function familyFor(award: SeasonAward): AwardFamily {
  switch (award.group) {
    case "Teamwork": return "team";
    case "Meme inserts": return "wild";
    case "Season stories": return "story";
    case "Best of Champions": return "story";
    case "Support & survival": return "guardian";
    case "Record breakers": return "record";
  }
}

function familyLabel(award: SeasonAward): string {
  if (award.group === "Best of Champions") return "Best of Champions";
  switch (familyFor(award)) {
    case "record": return "Record breakers";
    case "guardian": return "Support & survival";
    case "wild": return "Wild cards";
    case "story": return "Season stories";
    case "team": return "Teamwork";
  }
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
    archetype: winner.title ?? award.title,
    motto: winner.detail ?? award.description,
    ...(winner.champion ? {
      signature: { champion: winner.champion, games: winner.championGames ?? card.signature?.games ?? 0 },
      artSkin: 0,
    } : {}),
    standout: false,
  };
}

function cardsForWinner(
  winner: AwardWinner,
  award: SeasonAward,
  cards: PlayerCardData[],
  cardsByPlayer: Map<string, PlayerCardData>,
  season: string,
): PlayerCardData[] {
  const winnerCards = winnerNames(winner)
    .map((name) => cardsByPlayer.get(winnerKey(name)))
    .filter((card): card is PlayerCardData => Boolean(card));
  const teamCards = winner.name === winner.team
    ? cards.filter((card) => card.teamName?.trim().toLowerCase() === winner.team.trim().toLowerCase())
    : [];
  const candidateTeam = teamCards.length ? buildTeamCards(teamCards, undefined, season)[0] : null;
  const team = candidateTeam?.slots.every((slot) => slot.slug) ? candidateTeam : null;
  return team
    ? [teamToCard(team, season, 0)]
    : winnerCards.map((card) => decorateCard(card, award, winner));
}

function championFor(cards: PlayerCardData[]): string | null {
  for (const card of cards) {
    const champion = card.signature?.champion ?? card.team?.slots.find((slot) => slot.champion)?.champion;
    if (champion) return champion;
  }
  return null;
}

function DivisionMark({ division }: { division: Division }) {
  return (
    <span className={styles.divisionMark} aria-label={`${division} division`} title={`${division} division`}>
      <span aria-hidden="true">{division === "Solari" ? "☀" : "☾"}</span>
      <span>{division}</span>
    </span>
  );
}

function AwardVisualCard({
  award,
  winner,
  cards,
  season,
  league,
  winnerIndex,
  division,
}: {
  award: SeasonAward;
  winner: AwardWinner;
  cards: PlayerCardData[];
  season: string;
  league: "premier" | "academy";
  winnerIndex: number;
  division?: Division;
}) {
  const family = familyFor(award);
  const champion = championFor(cards);
  const art = champion ? championSplashUrl(champion, 0) : null;
  const display = formatAwardPresentation(award, winner);
  const roster = cards[0]?.team?.slots.filter((slot) => slot.slug).map((slot) => slot.name) ?? [];
  const titleId = `title-${award.id}-${division ?? "global"}-${winnerIndex}`;
  const title = winner.title ?? award.title;

  return (
    <article aria-labelledby={titleId} className={`${styles.card} ${styles[family]}`}>
      <div
        className={styles.art}
        data-testid="award-card-art"
        aria-hidden="true"
        style={art ? { backgroundImage: `linear-gradient(180deg, transparent 10%, #101620 100%), url("${art}")` } : undefined}
      />
      <div className={styles.topline}><span>{season} · {league}</span>{division ? <DivisionMark division={division} /> : <span>REGULAR</span>}</div>
      <div className={styles.content}>
        <p className={styles.collection}>{familyLabel(award)}</p>
        <h3 id={titleId} className={styles.title}>{title}</h3>
        {award.id !== "best-of-champion" ? <p className={styles.description}>{award.description}</p> : null}
        <p className={styles.name}>{winner.name}</p>
        <div className={styles.value}>
          {display.unit === "$" ? "$" : ""}{display.headline}
          {display.unit && display.unit !== "$" ? <span className={styles.unit}>{display.unit}</span> : null}
        </div>
        <p className={styles.evidence}>{display.evidence}</p>
        {roster.length ? (
          <details className={styles.details}>
            <summary>Season roster · {roster.length} contributors</summary>
            <ul>{roster.map((name) => <li key={name}>{name}</li>)}</ul>
          </details>
        ) : null}
        <div className={styles.seal}><span>SEASON ARCHIVE</span><span>ADMIN PREVIEW</span></div>
      </div>
    </article>
  );
}

function EmptyAwardCard({
  award,
  season,
  league,
  division,
}: {
  award: SeasonAward;
  season: string;
  league: "premier" | "academy";
  division?: Division;
}) {
  const divisionStatus = division ? award.divisionStatuses?.[division] : undefined;
  const status = divisionStatus?.status ?? award.status;
  const note = divisionStatus?.note ?? award.note;
  const titleId = `title-${award.id}-${division ?? "global"}`;
  const statusNote = note ?? (award.id === "best-of-champion" ? "No qualifying champion assignment yet." : award.description);

  return (
    <article aria-labelledby={titleId} className={`${styles.card} ${styles[familyFor(award)]}`}>
      <div className={styles.topline}><span>{season} · {league}</span>{division ? <DivisionMark division={division} /> : <span>REGULAR</span>}</div>
      <div className={styles.content}>
        <p className={styles.collection}>{familyLabel(award)}</p>
        <h3 id={titleId} className={styles.title}>{award.title}</h3>
        {award.id !== "best-of-champion" ? <p className={styles.description}>{award.description}</p> : null}
        <p className={styles.empty}>{status === "unearned" ? "Not earned yet" : "Awaiting evidence"}</p>
        <p className={styles.evidence}>{statusNote}</p>
        <div className={styles.seal}><span>SEASON ARCHIVE</span><span>ADMIN PREVIEW</span></div>
      </div>
    </article>
  );
}

/** The original Season's End treatment: tall archive cards with champion splash art. */
export default function SeasonEndAwardCard({
  award,
  season,
  league,
  cards,
}: {
  award: SeasonAward;
  season: string;
  league: "premier" | "academy";
  index: number;
  cards: PlayerCardData[];
}) {
  const cardsByPlayer = new Map(cards.map((card) => [cardPlayerKey(card.name, card.tag), card]));
  const isDivisional = Boolean(award.divisionStatuses);

  if (award.id === "best-of-champion") {
    const bestOfCard = (winner: AwardWinner | null, winnerIndex: number, division?: Division) => (
      <BestOfChampionCard
        key={`${division ?? "global"}-${winner?.name ?? "empty"}-${winnerIndex}`}
        award={award}
        winner={winner}
        playerCard={winner ? cardsForWinner(winner, award, cards, cardsByPlayer, season)[0] ?? null : null}
        season={season}
        league={league}
        headingId={`title-${award.id}-${division ?? "global"}-${winner ? winnerIndex : "empty"}`}
        division={division ?? winner?.division}
      />
    );

    if (isDivisional) {
      return (
        <div className={styles.cardGroup}>
          {(["Solari", "Lunari"] as const).flatMap((division) => {
            const winners = award.winners.filter((winner) => winner.division === division);
            return winners.length ? winners.map((winner, winnerIndex) => bestOfCard(winner, winnerIndex, division)) : [bestOfCard(null, 0, division)];
          })}
        </div>
      );
    }

    return (
      <div className={styles.cardGroup}>
        {award.winners.length ? award.winners.map((winner, winnerIndex) => bestOfCard(winner, winnerIndex)) : bestOfCard(null, 0)}
      </div>
    );
  }

  if (isDivisional) {
    return (
      <div className={styles.cardGroup}>
        {(["Solari", "Lunari"] as const).flatMap((division) => {
          const winners = award.winners.filter((winner) => winner.division === division);
          return winners.length ? winners.map((winner, winnerIndex) => (
            <AwardVisualCard
              key={`${division}-${winner.name}-${winnerIndex}`}
              award={award}
              winner={winner}
              cards={cardsForWinner(winner, award, cards, cardsByPlayer, season)}
              season={season}
              league={league}
              winnerIndex={winnerIndex}
              division={division}
            />
          )) : [<EmptyAwardCard key={division} award={award} season={season} league={league} division={division} />];
        })}
      </div>
    );
  }

  return (
    <div className={styles.cardGroup}>
      {award.winners.length ? award.winners.map((winner, winnerIndex) => (
        <AwardVisualCard
          key={`${winner.name}-${winnerIndex}`}
          award={award}
          winner={winner}
          cards={cardsForWinner(winner, award, cards, cardsByPlayer, season)}
          season={season}
          league={league}
          winnerIndex={winnerIndex}
          division={award.partition === "division" ? winner.division : undefined}
        />
      )) : <EmptyAwardCard award={award} season={season} league={league} />}
    </div>
  );
}

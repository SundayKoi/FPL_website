import type { ReactNode } from "react";
import { championSplashUrl } from "@/lib/match-draft/champions";
import { cardPlayerKey, type PlayerCardData } from "@/lib/cards/build";
import { buildTeamCards, teamToCard } from "@/lib/cards/teamCards";
import BestOfChampionCard from "./BestOfChampionCard";
import type { AwardWinner, SeasonAward } from "@/lib/season-end/derive";
import { formatAwardPresentation, formatInteger } from "@/lib/season-end/presentation";
import type { Division } from "@/lib/schedule/types";
import styles from "./SeasonEndAwardCard.module.css";

const FACE_EVIDENCE_LIMIT = 64;

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

function compactEvidence(winner: AwardWinner): string {
  const team = winner.name === winner.team ? null : winner.team;
  const games = `${formatInteger(winner.games)} ${winner.games === 1 ? "game" : "games"}`;
  return [team, games].filter(Boolean).join(" · ");
}

function AwardFace({
  titleId,
  title,
  description,
  art,
  season,
  league,
  division,
  result,
}: {
  titleId: string;
  title: string;
  description: string;
  art: string | null;
  season: string;
  league: "premier" | "academy";
  division?: Division;
  result: ReactNode;
}) {
  return (
    <div className={styles.face} data-testid="award-card-face">
      <div className={styles.artRegion}>
        <div
          className={styles.art}
          data-testid="award-card-art"
          aria-hidden="true"
          style={art ? { backgroundImage: `url("${art}")` } : undefined}
        />
        <div className={styles.artShade} aria-hidden="true" />
        <div className={styles.meta}>
          <span>{season} · {league}</span>
          {division ? <DivisionMark division={division} /> : null}
        </div>
        <div className={styles.overlay}>
          <h3 id={titleId} className={styles.title}>{title}</h3>
          <p className={styles.description}>{description}</p>
        </div>
      </div>
      {result}
      <span className={styles.frame} aria-hidden="true" />
      <span className={styles.ornaments} aria-hidden="true">
        <span className={`${styles.corner} ${styles.cornerTopLeft}`} />
        <span className={`${styles.corner} ${styles.cornerTopRight}`} />
        <span className={`${styles.corner} ${styles.cornerBottomLeft}`} />
        <span className={`${styles.corner} ${styles.cornerBottomRight}`} />
      </span>
    </div>
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
  const champion = championFor(cards);
  const art = champion ? championSplashUrl(champion, 0) : null;
  const display = formatAwardPresentation(award, winner);
  const roster = cards[0]?.team?.slots.filter((slot) => slot.slug).map((slot) => slot.name) ?? [];
  const titleId = `title-${award.id}-${division ?? "global"}-${winnerIndex}`;
  const title = winner.title ?? award.title;
  const hasExtendedEvidence = display.evidence.length > FACE_EVIDENCE_LIMIT;

  return (
    <article aria-labelledby={titleId} className={styles.card}>
      <AwardFace
        titleId={titleId}
        title={title}
        description={award.description}
        art={art}
        season={season}
        league={league}
        division={division}
        result={(
          <div className={styles.resultPanel}>
            <div className={styles.resultGrid}>
              <p className={styles.name}>{winner.name}</p>
              <div className={styles.value}>
                {display.unit === "$" ? "$" : ""}{display.headline}
                {display.unit && display.unit !== "$" ? <span className={styles.unit}>{display.unit}</span> : null}
              </div>
              <p className={styles.evidence}>{hasExtendedEvidence ? compactEvidence(winner) : display.evidence}</p>
            </div>
          </div>
        )}
      />
      {hasExtendedEvidence ? (
        <details className={styles.details}>
          <summary>Full evidence</summary>
          <p>{display.evidence}</p>
        </details>
      ) : null}
      {roster.length ? (
        <details className={styles.details}>
          <summary>Season roster · {roster.length} contributors</summary>
          <ul>{roster.map((name) => <li key={name}>{name}</li>)}</ul>
        </details>
      ) : null}
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
  const hasExtendedNote = statusNote.length > FACE_EVIDENCE_LIMIT;

  return (
    <article aria-labelledby={titleId} className={styles.card}>
      <AwardFace
        titleId={titleId}
        title={award.title}
        description={award.description}
        art={null}
        season={season}
        league={league}
        division={division}
        result={(
          <div className={`${styles.resultPanel} ${styles.emptyPanel}`}>
            <p className={styles.empty}>{status === "unearned" ? "Not earned yet" : "Awaiting evidence"}</p>
            <p className={styles.evidence}>{hasExtendedNote ? "Full status note available below." : statusNote}</p>
          </div>
        )}
      />
      {hasExtendedNote ? (
        <details className={styles.details}>
          <summary>Full status note</summary>
          <p>{statusNote}</p>
        </details>
      ) : null}
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

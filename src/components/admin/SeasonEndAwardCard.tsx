import type { ReactNode } from "react";
import { championByName, championCenteredUrl, championSplashUrl } from "@/lib/match-draft/champions";
import { cardPlayerKey, teamBadgeKey, type PlayerCardData } from "@/lib/cards/build";
import { championArtCrop } from "@/lib/season-end/championArt";
import { DUO_COMPONENTS, type DuoEvidence, type DuoMemberEvidence } from "@/lib/season-end/duo";
import type { PairArtMember } from "@/lib/season-end/pairArt";
import type { SeasonEndTeamIdentityMap } from "@/lib/season-end/queries";
import AwardArtwork, { type AwardArtworkProps } from "./AwardArtwork";
import BestOfChampionCard from "./BestOfChampionCard";
import BestOfVariantViewer from "./BestOfVariantViewer";
import type { AwardWinner, SeasonAward } from "@/lib/season-end/derive";
import { formatAwardPresentation, formatInteger } from "@/lib/season-end/presentation";
import type { Division } from "@/lib/schedule/types";
import styles from "./SeasonEndAwardCard.module.css";

const FACE_EVIDENCE_LIMIT = 64;
const PAIR_ROLE_LABELS: Record<string, string> = { TOP: "Top", JUNGLE: "Jungle", MIDDLE: "Mid", BOTTOM: "Bot", UTILITY: "Support" };

function winnerKey(name: string): string {
  const separator = name.lastIndexOf("#");
  return separator > 0 ? cardPlayerKey(name.slice(0, separator), name.slice(separator + 1)) : name.trim().toLowerCase();
}

function teamMonogram(teamName: string): string {
  return teamName.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 3).toUpperCase() || "TEAM";
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
): PlayerCardData[] {
  if (award.scope === "pair" || award.scope === "team") return [];
  const winnerKeys = winner.playerKeys?.length ? winner.playerKeys : [winnerKey(winner.name)];
  const winnerCards = winnerKeys
    .map((key) => cardsByPlayer.get(key))
    .filter((card): card is PlayerCardData => Boolean(card));
  return winnerCards.map((card) => decorateCard(card, award, winner));
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

function roleLabel(role: DuoMemberEvidence["role"]): PairArtMember["role"] {
  return ({ TOP: "Top", JUNGLE: "Jungle", MIDDLE: "Mid", BOTTOM: "Bot", UTILITY: "Support" } as const)[role];
}

function pairMembersForWinner(award: SeasonAward, winner: AwardWinner): [PairArtMember, PairArtMember] {
  const duoMembers = winner.evidence?.duo?.members;
  if (duoMembers) {
    return duoMembers.map((member) => ({
      playerKey: member.playerKey,
      name: member.name,
      role: roleLabel(member.role),
      champion: member.champion ? {
        id: member.champion.championId,
        name: member.champion.champion,
        games: member.champion.games,
        wins: member.champion.wins,
        winRate: member.champion.winRate / 100,
        ...(member.champion.meanPerformance === undefined ? {} : { meanPerformance: member.champion.meanPerformance }),
      } : null,
    })) as [PairArtMember, PairArtMember];
  }
  if (winner.pairMembers) return winner.pairMembers;
  const roles = award.id === "bot-support-connection"
    ? ["Bot", "Support"] as const
    : award.id === "top-jungle-connection"
      ? ["Top", "Jungle"] as const
      : ["Jungle", "Mid"] as const;
  return roles.map((role, index) => ({
    playerKey: winner.playerKeys?.[index] ?? role.toLowerCase(),
    name: `${role} player`,
    role,
    champion: null,
  })) as [PairArtMember, PairArtMember];
}

function duoWinnerName(winner: AwardWinner): string {
  return winner.evidence?.duo?.members.map((member) => member.name).join(" + ") ?? winner.name;
}

function formatDuoRaw(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function DuoBreakdown({ evidence }: { evidence: DuoEvidence }) {
  return (
    <details className={styles.details}>
      <summary>Duo Impact breakdown</summary>
      <p>Each component is a same-role percentile in the selected division and season. These are normalized scores, not raw percentages or absolute ratings comparable across seasons.</p>
      <ul>
        {DUO_COMPONENTS.map(({ key, label, weight }) => (
          <li key={key}>{label} · {formatInteger(weight * 100)}% · {formatInteger(evidence.componentScores[key])} / 100</li>
        ))}
      </ul>
      <ul>
        {evidence.members.map((member) => (
          <li key={member.playerKey}>
            {member.name} ({roleLabel(member.role)}) · KP {formatDuoRaw(member.rawAverages.kill_participation_pct)}% · KDA {formatDuoRaw(member.rawAverages.kda)} · damage/min {formatDuoRaw(member.rawAverages.damage_per_min)} · vision/min {formatDuoRaw(member.rawAverages.vision_score_per_min)}
          </li>
        ))}
      </ul>
    </details>
  );
}

function AwardFace({
  titleId,
  title,
  description,
  category,
  artwork,
  season,
  league,
  division,
  result,
}: {
  titleId: string;
  title: string;
  description?: string;
  category: SeasonAward["group"];
  artwork: AwardArtworkProps;
  season: string;
  league: "premier" | "academy";
  division?: Division;
  result: ReactNode;
}) {
  return (
    <div className={styles.face} data-testid="award-card-face">
      <div className={styles.artRegion}>
        <AwardArtwork {...artwork} />
        <div className={styles.artShade} aria-hidden="true" />
        <div className={styles.meta}>
          <span>{season} · {league}</span>
          {division ? <DivisionMark division={division} /> : null}
        </div>
        <div className={styles.overlay}>
          <p className={styles.category}>{category}</p>
          <h3 id={titleId} className={styles.title}>{title}</h3>
          {description ? <p className={styles.description}>{description}</p> : null}
        </div>
      </div>
      {result}
    </div>
  );
}

function AwardVisualCard({
  award,
  winner,
  cards,
  teamIdentities,
  season,
  league,
  winnerIndex,
  division,
}: {
  award: SeasonAward;
  winner: AwardWinner;
  cards: PlayerCardData[];
  teamIdentities: SeasonEndTeamIdentityMap;
  season: string;
  league: "premier" | "academy";
  winnerIndex: number;
  division?: Division;
}) {
  const champion = championFor(cards);
  const crop = champion ? championArtCrop(champion, 0) : null;
  const centeredArt = champion ? championCenteredUrl(champion, 0) : null;
  const splashArt = champion ? championSplashUrl(champion, 0) : null;
  const fallbackRoles = award.id === "bot-support-connection"
    ? ["Bot", "Support"]
    : award.id === "top-jungle-connection"
      ? ["Top", "Jungle"]
      : ["Jungle", "Mid"];
  const pairMembers = award.scope === "pair" ? pairMembersForWinner(award, winner) : fallbackRoles.map((role, index) => ({
    playerKey: `${role.toLowerCase()}-${index}`,
    name: `${role} player`,
    role: role as PairArtMember["role"],
    champion: null,
  }));
  const teamIdentity = award.scope === "team" ? teamIdentities[teamBadgeKey(winner.team)] : undefined;
  const artwork: AwardArtworkProps = award.scope === "pair"
    ? {
        variant: "pair",
        panels: pairMembers.map((member) => {
          const memberChampion = member.champion;
          const championName = memberChampion?.name ?? null;
          const hasArt = Boolean(memberChampion && championByName(memberChampion.name));
          const memberCrop = hasArt && championName ? championArtCrop(championName, 0) : null;
          return {
            key: `${member.playerKey}-${member.role}`,
            name: member.name,
            role: PAIR_ROLE_LABELS[member.role] ?? member.role,
            championName,
            primaryUrl: hasArt && championName ? championCenteredUrl(championName, 0) : null,
            fallbackUrl: hasArt && championName ? championSplashUrl(championName, 0) : null,
            cropPositionX: memberCrop?.cropPositionX ?? 50,
            cropPositionY: memberCrop?.cropPositionY ?? 50,
            zoom: memberCrop?.zoom ?? 1,
          };
        }),
      }
    : award.scope === "team"
      ? {
          variant: "team",
          teamName: teamIdentity?.name ?? winner.team,
          logoUrl: teamIdentity?.imageUrl ?? null,
          fallbackLabel: teamIdentity?.abbreviation ?? teamMonogram(winner.team),
          bannerColor: teamIdentity?.bannerColor ?? null,
        }
      : {
          variant: "single",
          primaryUrl: centeredArt,
          fallbackUrl: splashArt,
          cropPositionX: crop?.cropPositionX ?? 50,
          cropPositionY: crop?.cropPositionY ?? 50,
          zoom: crop?.zoom ?? 1,
        };
  const display = formatAwardPresentation(award, winner);
  const roster = award.scope === "team" ? [] : cards[0]?.team?.slots.filter((slot) => slot.slug).map((slot) => slot.name) ?? [];
  const titleId = `title-${award.id}-${division ?? "global"}-${winnerIndex}`;
  const title = winner.title ?? award.title;
  const hasExtendedEvidence = display.evidence.length > FACE_EVIDENCE_LIMIT;
  const duoEvidence = winner.evidence?.duo;

  return (
    <article aria-labelledby={titleId} className={styles.card}>
      <AwardFace
        titleId={titleId}
        title={title}
        description={award.scope === "pair" ? undefined : award.description}
        category={award.group}
        artwork={artwork}
        season={season}
        league={league}
        division={division}
        result={(
          <div className={styles.resultPanel}>
            <div className={styles.resultGrid}>
              <p className={styles.name}>{duoWinnerName(winner)}</p>
              <div className={styles.value}>
                {display.unit === "$" ? "$" : ""}{display.headline}
                {display.unit && display.unit !== "$" ? (
                  <span className={`${styles.unit} ${display.unit.length <= 2 ? styles.unitInline : ""}`}>
                    {duoEvidence ? "· " : ""}{display.unit}
                  </span>
                ) : null}
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
      {duoEvidence ? <DuoBreakdown evidence={duoEvidence} /> : null}
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
  const statusNote = note ?? (
    award.id === "best-of-champion"
      ? "No qualifying champion assignment yet."
      : award.scope === "pair"
        ? "No qualifying pair yet."
        : award.description
  );
  const hasExtendedNote = statusNote.length > FACE_EVIDENCE_LIMIT;

  return (
    <article aria-labelledby={titleId} className={styles.card}>
      <AwardFace
        titleId={titleId}
        title={award.title}
        description={award.scope === "pair" ? undefined : award.description}
        category={award.group}
        artwork={{ variant: "empty" }}
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

/** Midnight foil accolades with champion art and a stacked award result. */
export default function SeasonEndAwardCard({
  award,
  season,
  league,
  cards,
  teamIdentities = {},
  showAdminDetails = true,
}: {
  award: SeasonAward;
  season: string;
  league: "premier" | "academy";
  index: number;
  cards: PlayerCardData[];
  teamIdentities?: SeasonEndTeamIdentityMap;
  showAdminDetails?: boolean;
}) {
  const cardsByPlayer = new Map(cards.map((card) => [cardPlayerKey(card.name, card.tag), card]));
  const isDivisional = Boolean(award.divisionStatuses);

  if (award.id === "best-of-champion") {
    const bestOfCard = (winner: AwardWinner | null, winnerIndex: number, division?: Division) => {
      const playerCard = winner ? cardsForWinner(winner, award, cards, cardsByPlayer)[0] ?? null : null;
      const headingId = `title-${award.id}-${division ?? "global"}-${winner ? winnerIndex : "empty"}`;
      const card = (
        <BestOfChampionCard
          key={`${division ?? "global"}-${winner?.name ?? "empty"}-${winnerIndex}`}
          award={award}
          winner={winner}
          playerCard={playerCard}
          season={season}
          league={league}
          headingId={headingId}
          division={division ?? winner?.division}
          showAdminDetails={showAdminDetails}
        />
      );
      if (!winner?.champion) return card;
      return (
        <BestOfVariantViewer
          key={`${division ?? "global"}-${winner.name}-${winnerIndex}`}
          award={award}
          winner={winner}
          playerCard={playerCard}
          season={season}
          league={league}
          headingId={headingId}
          division={division ?? winner.division}
        >
          {card}
        </BestOfVariantViewer>
      );
    };

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
              cards={cardsForWinner(winner, award, cards, cardsByPlayer)}
              teamIdentities={teamIdentities}
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
          cards={cardsForWinner(winner, award, cards, cardsByPlayer)}
          teamIdentities={teamIdentities}
          season={season}
          league={league}
          winnerIndex={winnerIndex}
          division={award.partition === "division" ? winner.division : undefined}
        />
      )) : <EmptyAwardCard award={award} season={season} league={league} />}
    </div>
  );
}

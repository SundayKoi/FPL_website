import Image from "next/image";
import type { CSSProperties } from "react";
import { championDisplayName, championSplashUrl } from "@/lib/match-draft/champions";
import type { PlayerCardData } from "@/lib/cards/build";
import type { AwardWinner, SeasonAward } from "@/lib/season-end/derive";
import { championArtCrop } from "@/lib/season-end/championArt";
import { formatAwardPresentation } from "@/lib/season-end/presentation";
import type { Division } from "@/lib/schedule/types";
import BestOfDivisionEmblem from "./BestOfDivisionEmblem";
import styles from "./BestOfChampionCard.module.css";

type League = "premier" | "academy";

export interface BestOfChampionCardProps {
  award: SeasonAward;
  winner?: AwardWinner | null;
  playerCard?: PlayerCardData | null;
  season: string;
  league: League;
  headingId: string;
  division?: Division;
  /** Reserved for frozen signed pulls; live admin previews omit it. */
  autograph?: string | null;
}

function accountName(winner: AwardWinner | null | undefined, playerCard: PlayerCardData | null | undefined): string | null {
  const name = winner?.name ?? (playerCard ? `${playerCard.name}#${playerCard.tag}` : null);
  if (!name) return null;
  const separator = name.lastIndexOf("#");
  return (separator > 0 ? name.slice(0, separator) : name).trim() || null;
}

function fullIdentity(winner: AwardWinner | null | undefined, playerCard: PlayerCardData | null | undefined): string | null {
  return winner?.name ?? (playerCard ? `${playerCard.name}#${playerCard.tag}` : null);
}

function Frame() {
  return <span className={styles.frame} aria-hidden="true" />;
}

export default function BestOfChampionCard({
  award,
  winner = null,
  playerCard = null,
  season,
  league,
  headingId,
  division,
  autograph = null,
}: BestOfChampionCardProps) {
  const champion = winner?.champion ?? playerCard?.signature?.champion ?? null;
  const championLabel = champion ? championDisplayName(champion) : null;
  const title = winner?.title ?? (championLabel ? `Best of ${championLabel}` : award.title);
  const kicker = championLabel ? `Best of ${championLabel}` : award.title;
  const name = accountName(winner, playerCard);
  const identity = fullIdentity(winner, playerCard);
  const team = winner?.team ?? playerCard?.teamName ?? null;
  const display = winner ? formatAwardPresentation(award, winner) : null;
  const status = winner ? null : (award.status === "unearned" ? "Not earned yet" : "Awaiting evidence");
  const statusNote = winner ? null : (award.note ?? "No qualifying champion assignment yet.");
  const art = champion ? championSplashUrl(champion, 0) : null;
  const crop = champion ? championArtCrop(champion, 0) : null;
  const leagueLabel = league === "premier" ? "Premier" : "Academy";
  const articleLabel = winner && identity
    ? `${title} — ${identity}`
    : title;
  const artStyle: CSSProperties | undefined = art && crop ? {
    backgroundImage: `url("${art}")`,
    backgroundPosition: `${crop.cropPositionX}% ${crop.cropPositionY}%`,
    backgroundSize: crop.zoom === 1 ? "cover" : `auto ${crop.zoom * 100}%`,
  } : undefined;

  return (
    <article aria-labelledby={headingId} className={`${styles.card} ${winner ? styles.winner : styles.emptyState}`} aria-label={articleLabel}>
      <div className={styles.face}>
        <div
          className={styles.art}
          data-testid="best-of-card-art"
          data-champion={champion ?? undefined}
          aria-hidden="true"
          style={artStyle}
        />
        <div className={styles.shade} aria-hidden="true" />
        <Frame />

        <div className={styles.srOnly}>
          <h3 id={headingId}>{title}</h3>
        </div>

        {winner && division ? <BestOfDivisionEmblem division={division} /> : null}

        {winner ? (
          <div className={styles.identity}>
            <p className={styles.kicker}>{kicker}</p>
            <p className={styles.name}>{name ?? "—"}</p>
            {identity ? <span className={styles.srOnly}>Full player identity: {identity}</span> : null}
          </div>
        ) : (
          <div className={styles.emptyIdentity}>
            <p className={styles.kicker}>{kicker}</p>
            <p className={styles.emptyStatus}>{status}</p>
          </div>
        )}

        {winner && autograph ? (
          <span className={styles.autographBox} data-testid="best-of-autograph">
            <Image
              src={autograph}
              alt={`${identity ?? name ?? "Player"}'s autograph`}
              fill
              sizes="96px"
              unoptimized
              className={styles.autograph}
            />
          </span>
        ) : null}

        <footer className={styles.footer}>
          <span className={styles.seasonLeague}>{season} {leagueLabel}</span>
        </footer>
      </div>

      <div className={styles.details}>
        {winner ? (
          <>
            <p className={styles.detailsLabel}>Best of Champion · Admin preview</p>
            <p className={styles.detailsIdentity}>{identity}{team ? ` · ${team}` : ""}{playerCard?.role ? ` · ${playerCard.role}` : ""}</p>
            <p className={styles.evidence}>Assignment evidence · {display?.evidence}</p>
          </>
        ) : (
          <>
            <p className={styles.detailsLabel}>Admin preview</p>
            <p className={styles.evidence}>{statusNote}</p>
          </>
        )}
        <p className={styles.description}>{award.description}</p>
      </div>
    </article>
  );
}

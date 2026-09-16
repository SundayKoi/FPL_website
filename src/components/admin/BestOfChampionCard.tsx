import Image from "next/image";
import type { CSSProperties } from "react";
import { championDisplayName, championSplashUrl } from "@/lib/match-draft/champions";
import type { PlayerCardData } from "@/lib/cards/build";
import type { AwardWinner, SeasonAward } from "@/lib/season-end/derive";
import { championArtCrop, type ChampionArtCrop } from "@/lib/season-end/championArt";
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
  /** Local-only override used by the developer crop-audit surface. */
  crop?: ChampionArtCrop | null;
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

const CORNER_ENGRAVING = "M14 69V27L27 14H83 M20 57V31L31 20H68 M14 40L40 14 M23 23L34 34L44 24 M35 16L42 23L35 30L28 23Z";

function CelestialFrame() {
  return (
    <>
      <span className={styles.frame} aria-hidden="true" />
      <svg className={styles.ornament} data-testid="best-of-card-ornament" viewBox="0 0 350 490" fill="none" stroke="currentColor" strokeWidth=".9" aria-hidden="true" focusable="false">
        <path d={CORNER_ENGRAVING} />
        <path d={CORNER_ENGRAVING} transform="translate(350 0) scale(-1 1)" />
        <path d={CORNER_ENGRAVING} transform="translate(0 490) scale(1 -1)" />
        <path d={CORNER_ENGRAVING} transform="translate(350 490) scale(-1 -1)" />
        <path d="M85 12H150L163 17H187L200 12H265 M154 12L175 7L196 12 M14 130L23 151V206L14 222 M336 130L327 151V206L336 222 M120 475L145 463H162L175 477L188 463H205L230 475 M149 469L175 448L201 469" />
        <circle cx="175" cy="12" r="3" />
      </svg>
    </>
  );
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
  crop = null,
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
  const artCrop = crop ?? (champion ? championArtCrop(champion, 0) : null);
  const leagueLabel = league === "premier" ? "Premier" : "Academy";
  const articleLabel = winner && identity
    ? `${title} — ${identity}`
    : title;
  const artStyle: CSSProperties | undefined = art && artCrop ? {
    backgroundImage: `url("${art}")`,
    backgroundPosition: `${artCrop.cropPositionX}% ${artCrop.cropPositionY}%`,
    backgroundSize: "cover",
    "--art-zoom": artCrop.zoom,
  } as CSSProperties : undefined;
  const faceClassName = [
    styles.face,
    division === "Solari" ? styles.solari : division === "Lunari" ? styles.lunari : "",
  ].filter(Boolean).join(" ");

  return (
    <article aria-labelledby={headingId} className={`${styles.card} ${winner ? styles.winner : styles.emptyState}`} aria-label={articleLabel}>
      <div className={faceClassName}>
        <div
          className={styles.art}
          data-testid="best-of-card-art"
          data-champion={champion ?? undefined}
          aria-hidden="true"
          style={artStyle}
        />
        <div className={styles.shade} aria-hidden="true" />
        <div className={styles.foil} data-testid="best-of-card-foil" aria-hidden="true" />
        <CelestialFrame />

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
        <span className={styles.gem} aria-hidden="true" />
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

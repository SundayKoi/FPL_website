import Image from "next/image";
import { championDisplayName, championSplashUrl } from "@/lib/match-draft/champions";
import type { PlayerCardData } from "@/lib/cards/build";
import type { AwardWinner, SeasonAward } from "@/lib/season-end/derive";
import { formatAwardPresentation, formatInteger } from "@/lib/season-end/presentation";
import type { Division } from "@/lib/schedule/types";
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

function DivisionMark({ division }: { division: Division }) {
  return (
    <span className={styles.divisionMark} aria-label={`${division} division`} title={`${division} division`}>
      <span aria-hidden="true">{division === "Solari" ? "☀" : "☾"}</span>
      <span>{division}</span>
    </span>
  );
}

function Frame() {
  return (
    <svg className={styles.frame} viewBox="0 0 500 700" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="494" height="694" rx="24" />
      <rect x="17" y="17" width="466" height="666" rx="17" />
      <path d="M62 17v20h-20M438 17v20h20M62 683v-20H42M438 683v-20h20" />
      <path d="M20 104c9-10 18-17 28-22M480 104c-9-10-18-17-28-22M20 596c9 10 18 17 28 22M480 596c-9 10-18 17-28 22" />
      <path d="M28 148h20M28 162h13M472 148h-20M472 162h-13M28 552h20M28 538h13M472 552h-20M472 538h-13" />
    </svg>
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
}: BestOfChampionCardProps) {
  const champion = winner?.champion ?? playerCard?.signature?.champion ?? null;
  const championLabel = champion ? championDisplayName(champion) : null;
  const title = winner?.title ?? (championLabel ? `Best of ${championLabel}` : award.title);
  const kicker = championLabel ? `Best of ${championLabel}` : award.title;
  const name = accountName(winner, playerCard);
  const identity = fullIdentity(winner, playerCard);
  const team = winner?.team ?? playerCard?.teamName ?? null;
  const overall = typeof playerCard?.overall === "number" && Number.isFinite(playerCard.overall)
    ? playerCard.overall
    : null;
  const display = winner ? formatAwardPresentation(award, winner) : null;
  const status = winner ? null : (award.status === "unearned" ? "Not earned yet" : "Awaiting evidence");
  const statusNote = winner ? null : (award.note ?? "No qualifying champion assignment yet.");
  const art = champion ? championSplashUrl(champion, 0) : null;
  const leagueLabel = league === "premier" ? "Premier" : "Academy";
  const articleLabel = winner && identity
    ? `${title} — ${identity}${overall === null ? ", overall unavailable" : `, ${formatInteger(overall)} overall`}`
    : title;

  return (
    <article aria-labelledby={headingId} className={`${styles.card} ${winner ? styles.winner : styles.emptyState}`} aria-label={articleLabel}>
      <div className={styles.face}>
        <div
          className={styles.art}
          data-testid="best-of-card-art"
          data-champion={champion ?? undefined}
          aria-hidden="true"
          style={art ? { backgroundImage: `url("${art}")` } : undefined}
        />
        <div className={`${styles.shade} ${styles.shadeTop}`} aria-hidden="true" />
        <div className={`${styles.shade} ${styles.shadeIdentity}`} aria-hidden="true" />
        <div className={`${styles.shade} ${styles.shadeFooter}`} aria-hidden="true" />
        <Frame />

        <div className={styles.srOnly}>
          <h3 id={headingId}>{title}</h3>
        </div>

        {winner ? (
          <div className={styles.overall} aria-label={overall === null ? "Overall unavailable" : `${formatInteger(overall)} overall`}>
            <span className={styles.overallNumber}>{overall === null ? "—" : formatInteger(overall)}</span>
            <span className={styles.overallLabel}>OVR</span>
          </div>
        ) : null}

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
          {division ? <DivisionMark division={division} /> : null}
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

import Image from "next/image";
import type { HomepageAwardsData } from "@/lib/home/awards";
import { normalizeTeamName } from "@/lib/league/context";
import { championCenteredUrl } from "@/lib/match-draft/champions";
import type { PlayerCardData } from "@/lib/cards/build";
import type { TeamIdentity } from "@/lib/teams/identity";
import { teamSlug } from "@/lib/teams/teamPage";
import styles from "./HomeWorkspace.module.css";

function sameIdentity(card: PlayerCardData, awards: HomepageAwardsData): boolean {
  const award = awards.playerOfWeek;
  return Boolean(
    award.name && award.tag && award.teamName && awards.periodKey &&
      card.season === awards.season &&
      card.snapshotWeek === awards.periodKey &&
      card.name.trim().toLocaleLowerCase() === award.name.trim().toLocaleLowerCase() &&
      card.tag.trim().toLocaleLowerCase() === award.tag.trim().toLocaleLowerCase() &&
      normalizeTeamName(card.teamName) === normalizeTeamName(award.teamName) &&
      !card.moment && !card.team && !card.champWin,
  );
}

export default function PlayerOfWeekSpotlight({
  awards,
  cards,
  identities,
}: {
  awards: HomepageAwardsData;
  cards: PlayerCardData[];
  identities: Record<string, TeamIdentity>;
}) {
  const award = awards.playerOfWeek;
  const winnerCard = cards.find((card) => sameIdentity(card, awards)) ?? null;
  const champion = winnerCard?.artChampion ?? winnerCard?.signature?.champion ?? null;
  const championArt = champion ? championCenteredUrl(champion, winnerCard?.artSkin ?? 0) : null;
  const teamName = award.teamName?.trim() || null;
  const teamIdentity = teamName ? identities[teamSlug(teamName)] : undefined;
  const initials = award.name?.trim().slice(0, 2).toUpperCase() || "—";

  return (
    <section aria-labelledby="player-week-title" className={styles.openSection}>
      <div className={styles.sectionHeading}>
        <div>
          <span className={styles.eyebrow}>{award.title}</span>
          <h2 id="player-week-title" className={`${styles.title} mt-2 text-2xl sm:text-3xl`}>{award.name ?? "Award data unavailable"}</h2>
        </div>
        <span className={styles.periodLabel}>{awards.periodLabel}</span>
      </div>

      <div className={styles.spotlightBody}>
        <div className={styles.spotlightArtwork}>
          {championArt && winnerCard ? (
            <Image
              src={championArt}
              alt={`${champion} artwork on ${award.name}'s ${awards.periodLabel} player card`}
              fill
              unoptimized
              sizes="(max-width: 700px) 42vw, 180px"
              className={styles.spotlightImage}
            />
          ) : (
            <span className={styles.spotlightInitials} aria-hidden>{initials}</span>
          )}
          <span className={styles.spotlightCardLabel}>{winnerCard ? "FPL player card" : "Card art unavailable"}</span>
        </div>

        <div className={styles.spotlightDetails}>
          <p className={styles.spotlightPlayer}>{award.name ?? "No player recorded"}</p>
          <p className={styles.spotlightTeam}>
            {teamIdentity?.imageUrl ? (
              // Team image URLs are stored in Supabase Storage and vary by deployment.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={teamIdentity.imageUrl} alt="" className={styles.spotlightTeamLogo} />
            ) : null}
            <span>{teamName ?? "Team not recorded"}</span>
            {winnerCard?.role ? <><span aria-hidden>·</span><span>{winnerCard.role}</span></> : null}
          </p>
          <p className={styles.spotlightDetail}>{award.detail}</p>
          {award.name && award.value !== "—" ? (
            <p className={styles.spotlightMetric}>
              <span>{award.title === "Player of the Week" ? "Weekly power" : award.title}</span>
              <strong>{award.value}</strong>
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

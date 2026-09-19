import type { ReactNode } from "react";
import type { Division } from "@/lib/schedule/types";
import AwardArtwork, { type AwardArtworkProps } from "./AwardArtwork";
import styles from "./SeasonEndAwardCard.module.css";

export default function SeasonEndAwardFace({
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
  category: string;
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
          {division ? (
            <span className={styles.divisionMark} aria-label={`${division} division`} title={`${division} division`}>
              <span aria-hidden="true">{division === "Solari" ? "☀" : "☾"}</span>
              <span>{division}</span>
            </span>
          ) : null}
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

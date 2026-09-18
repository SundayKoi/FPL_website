"use client";

/* Season's End artwork is frozen remote art and needs an observable fallback. */
/* eslint-disable @next/next/no-img-element */

import type { SeasonEndPullResult } from "@/lib/packs/season-end-actions";
import PlayerCard3D from "./PlayerCard3D";
import styles from "./CollectibleRenderer.module.css";

function Artwork({ pull }: { pull: SeasonEndPullResult }) {
  const artwork = pull.design.artwork;
  if (artwork.kind === "single") {
    return artwork.primaryUrl || artwork.fallbackUrl ? (
      <img
        src={artwork.primaryUrl ?? artwork.fallbackUrl ?? ""}
        alt=""
        className={styles.art}
        style={{ objectPosition: `${artwork.cropPositionX}% ${artwork.cropPositionY}%`, transform: `scale(${artwork.zoom})` }}
      />
    ) : <div className={styles.fallbackArt}>Season&apos;s End</div>;
  }
  if (artwork.kind === "pair") {
    return <div className={styles.pair}>{artwork.panels.map((panel) => (
      <div className={styles.panel} key={panel.key}>
        {panel.primaryUrl || panel.fallbackUrl ? <img src={panel.primaryUrl ?? panel.fallbackUrl ?? ""} alt="" className={styles.art} /> : null}
        <span>{panel.name} · {panel.role}</span>
      </div>
    ))}</div>;
  }
  if (artwork.kind === "team") {
    return <div className={styles.team} style={{ backgroundColor: artwork.bannerColor ?? "#101b24" }}>
      {artwork.logoUrl ? <img src={artwork.logoUrl} alt="" className={styles.teamLogo} /> : <span>{artwork.fallbackLabel}</span>}
      <strong>{artwork.teamName}</strong>
    </div>;
  }
  return <div className={styles.fallbackArt}>{artwork.label}</div>;
}

export default function CollectibleRenderer({ pull, compact = false }: { pull: SeasonEndPullResult; compact?: boolean }) {
  if (pull.design.kind === "season") {
    return (
      <div className={compact ? styles.compact : ""} data-testid="season-end-season-renderer">
        <PlayerCard3D
          card={{ ...pull.design.card, autograph: pull.autograph }}
          forceFoil={pull.foil}
          foilType={pull.foilType}
          interactive={false}
        />
      </div>
    );
  }
  return (
    <article className={`${styles.collectible} ${pull.foil ? styles.foil : ""}`} data-testid={`season-end-${pull.design.kind}-renderer`}>
      <div className={styles.header}>
        <span>{pull.design.kind === "best_of" ? "Best Of" : "Accolade"}</span>
        <span>{pull.foilType ?? "Matte"}</span>
      </div>
      <div className={styles.artwork}><Artwork pull={pull} /></div>
      <div className={styles.copy}>
        <p className={styles.kicker}>{pull.design.display.subtitle}</p>
        <h3>{pull.design.display.title}</h3>
        <p className={styles.headline}>{pull.design.display.headline}</p>
        <p className={styles.evidence}>{pull.design.display.evidence}</p>
        {pull.signed ? <p className={styles.signature}>✍ Signed copy</p> : null}
      </div>
    </article>
  );
}

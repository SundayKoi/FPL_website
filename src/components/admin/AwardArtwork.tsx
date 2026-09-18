"use client";

/* Native images are intentional here: CDN failures must be observable so the component can render a fallback. */
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import type { CSSProperties } from "react";
import styles from "./SeasonEndAwardCard.module.css";

export interface AwardArtworkPanel {
  key: string;
  name: string;
  role: string;
  championName: string | null;
  primaryUrl: string | null;
  fallbackUrl: string | null;
  cropPositionX: number;
  cropPositionY: number;
  zoom: number;
}

export type AwardArtworkProps =
  | {
      variant: "single";
      primaryUrl: string | null;
      fallbackUrl: string | null;
      cropPositionX: number;
      cropPositionY: number;
      zoom: number;
    }
  | {
      variant: "pair";
      panels: AwardArtworkPanel[];
    }
  | {
      variant: "team";
      teamName: string;
      logoUrl: string | null;
      fallbackLabel: string;
      bannerColor: string | null;
    }
  | { variant: "empty" };

function ResilientImage({
  primaryUrl,
  fallbackUrl,
  alt,
  className,
  style,
}: {
  primaryUrl: string | null;
  fallbackUrl: string | null;
  alt: string;
  className: string;
  style?: CSSProperties;
}) {
  const [source, setSource] = useState(primaryUrl ?? fallbackUrl);
  const [failed, setFailed] = useState(!(primaryUrl ?? fallbackUrl));
  if (failed || !source) return null;

  return (
    <img
      src={source}
      alt={alt}
      className={className}
      style={style}
      decoding="async"
      onError={() => {
        if (fallbackUrl && source !== fallbackUrl) setSource(fallbackUrl);
        else setFailed(true);
      }}
    />
  );
}

export default function AwardArtwork(props: AwardArtworkProps) {
  if (props.variant === "single") {
    return (
      <div className={styles.art} data-testid="award-card-art" aria-hidden="true">
        <ResilientImage
          primaryUrl={props.primaryUrl}
          fallbackUrl={props.fallbackUrl}
          alt=""
          className={styles.artImage}
          style={{
            objectPosition: `${props.cropPositionX}% ${props.cropPositionY}%`,
            transform: `scale(${props.zoom})`,
          }}
        />
      </div>
    );
  }

  if (props.variant === "pair") {
    return (
      <div className={styles.pairArt} data-testid="award-card-art">
        {props.panels.map((panel) => (
          <div
            key={panel.key}
            className={styles.pairPanel}
            data-testid="award-card-pair-panel"
            role="img"
            aria-label={`${panel.name}, ${panel.role}, ${panel.championName ?? "no champion art"}`}
          >
            <ResilientImage
              primaryUrl={panel.primaryUrl}
              fallbackUrl={panel.fallbackUrl}
              alt=""
              className={styles.artImage}
              style={{
                objectPosition: `${panel.cropPositionX}% ${panel.cropPositionY}%`,
                transform: `scale(${panel.zoom})`,
              }}
            />
            <div className={styles.pairPanelShade} aria-hidden="true" />
            <div className={styles.pairPanelLabel}>
              <span className={styles.pairMemberName}>{panel.name}</span>
              <span className={styles.pairChampionLabel}>{panel.role} · {panel.championName ?? "No champion art"}</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (props.variant === "team") {
    return (
      <div
        className={styles.teamArt}
        data-testid="award-card-art"
        style={{ "--team-color": props.bannerColor ?? "#101b24" } as CSSProperties}
        role="img"
        aria-label={`${props.teamName} logo`}
      >
        <span className={styles.teamMonogram} aria-hidden="true">{props.fallbackLabel}</span>
        <ResilientImage primaryUrl={props.logoUrl} fallbackUrl={null} alt={`${props.teamName} logo`} className={styles.teamLogo} />
      </div>
    );
  }

  return <div className={styles.art} data-testid="award-card-art" aria-hidden="true" />;
}

"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { formatKickoff, hasResult, stageMeta } from "@/lib/schedule/format";
import { teamSlug } from "@/lib/teams/teamPage";
import { teamPresentation } from "@/lib/teams/presentation";
import type { FixtureRow } from "@/lib/schedule/types";
import type { TeamIdentity } from "@/lib/teams/identity";
import type { TwitchClip, TwitchStreamState } from "@/lib/twitch/status";
import TeamLogo from "./TeamLogo";
import styles from "./HomeWorkspace.module.css";

function embedParent() { return typeof window === "undefined" ? null : window.location.hostname; }
function subscribe() { return () => {}; }

export default function HomeMatchupHero({ fixture, identities, clips, streamState, viewerCount, channelLogin, twitchUrl, title, description, scheduleHref, teamBasePath, seasonLabel }: {
  fixture: FixtureRow | null;
  identities: Record<string, TeamIdentity>;
  clips: TwitchClip[];
  streamState: TwitchStreamState;
  viewerCount: number | null;
  channelLogin: string;
  twitchUrl: string;
  title?: string;
  description?: string;
  scheduleHref: string;
  teamBasePath: string | null;
  seasonLabel?: string;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const parent = useSyncExternalStore(subscribe, embedParent, () => null);
  const isLive = streamState === "live";
  const clip = clips[0] ?? null;
  const embedSrc = useMemo(() => {
    if (!parent) return null;
    if (isLive) return `https://player.twitch.tv/?${new URLSearchParams({ channel: channelLogin, parent, autoplay: "true", muted: "true" })}`;
    if (clip) return `https://clips.twitch.tv/embed?${new URLSearchParams({ clip: clip.slug, parent, autoplay: "true", muted: "true" })}`;
    return null;
  }, [parent, isLive, channelLogin, clip]);
  const side = (name: string | null, position: "a" | "b") => {
    const identity = name ? identities[teamSlug(name)] : undefined;
    const presentation = teamPresentation(name, identity);
    const content = <>
      <TeamLogo name={name} identity={identity} className={styles.heroLogo} fallbackClassName={styles.heroFallback} />
      <span className={styles.heroTeamName}>{presentation.name}</span>
    </>;
    const className = `${styles.heroSide} ${position === "a" ? styles.heroSideA : styles.heroSideB}`;
    const style = { backgroundColor: presentation.fill, color: presentation.foreground } satisfies CSSProperties;
    return <div className={className} style={style}>
      {name && teamBasePath ? <Link href={`${teamBasePath}/${teamSlug(name)}`} className={styles.heroTeamLink}>{content}</Link> : <div className={styles.heroTeamLink}>{content}</div>}
    </div>;
  };
  const played = fixture ? hasResult(fixture) : false;
  const status = isLive
    ? `Channel live${viewerCount === null ? "" : ` · ${Intl.NumberFormat("en", { notation: "compact" }).format(viewerCount)} viewers`}`
    : streamState === "offline" ? "Channel offline" : "Channel status unknown";
  const heading = title?.trim() || (fixture ? "Pick a side." : "Franchise Premier League");
  const detail = description?.trim();
  const toggle = () => {
    setPreviewOpen((open) => !open);
    requestAnimationFrame(() => toggleRef.current?.focus());
  };

  return <section aria-label="Featured matchup and broadcast" className={styles.heroSection}>
    <div className={styles.heroCanvas}>
      {fixture ? <>
        {side(fixture.team_a, "a")}
        {side(fixture.team_b, "b")}
      </> : <div className={styles.heroNeutral} />}
      <div className={styles.heroCenter}>
        <span className={styles.heroEyebrow}>FPL · {seasonLabel ?? fixture?.season ?? "Current season"}</span>
        <h1 className={styles.heroHeading}>{heading}</h1>
        {fixture ? <p className={styles.heroMatchNames}>{fixture.team_a?.trim() || "TBD"} <span aria-hidden="true">vs</span> {fixture.team_b?.trim() || "TBD"}</p> : null}
        {fixture ? <p className={styles.heroMeta}>{stageMeta(fixture.stage).label} · {played ? `Final ${fixture.score_a}–${fixture.score_b}` : fixture.scheduled_at ? formatKickoff(fixture.scheduled_at) : "Time TBD"}</p> : <p className={styles.heroMeta}>Explore the current season</p>}
        {detail ? <p className={styles.heroDescription}>{detail}</p> : null}
        <div className={styles.heroActions}>
          {isLive || clip ? <button ref={toggleRef} type="button" aria-expanded={previewOpen} aria-controls="home-broadcast-preview" onClick={toggle} className={styles.heroPrimary}>{previewOpen ? "Hide broadcast" : isLive ? "Watch broadcast" : "Watch recent clip"}</button> : <a className={styles.heroPrimary} href={twitchUrl} target="_blank" rel="noreferrer">Open Twitch channel ↗</a>}
          <Link href={scheduleHref} className={styles.heroSecondary}>View schedule →</Link>
        </div>
        <span className={styles.heroChannel}>{status}</span>
      </div>
    </div>
    {previewOpen ? <div id="home-broadcast-preview" className={styles.heroPreview}>
      {embedSrc ? <iframe src={embedSrc} title={isLive ? "FPL live broadcast" : `Recent Twitch clip: ${clip?.title ?? "FPL"}`} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen /> : <p>Preview unavailable. <a href={twitchUrl} target="_blank" rel="noreferrer">Open the Twitch channel</a>.</p>}
      {clip && !isLive ? <p>Recent Twitch clip: {clip.title}</p> : null}
    </div> : null}
  </section>;
}

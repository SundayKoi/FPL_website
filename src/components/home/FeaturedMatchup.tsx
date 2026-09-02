"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import type { TwitchClip, TwitchStreamState } from "@/lib/twitch/status";
import { formatKickoff } from "@/lib/schedule/format";
import type { FixtureRow } from "@/lib/schedule/types";

type FeaturedMatchupProps = {
  fixture: FixtureRow | null;
  clips: TwitchClip[];
  streamState: TwitchStreamState;
  /** Live viewer count from the Twitch status check; null while offline. */
  viewerCount?: number | null;
  channelLogin: string;
  twitchUrl: string;
  title?: string;
  description?: string;
};

function getEmbedParent(): string | null {
  if (typeof window === "undefined") return null;
  return window.location.hostname || "localhost";
}

function subscribeToEmbedParent() {
  return () => {};
}

export default function FeaturedMatchup({
  fixture,
  clips,
  streamState,
  viewerCount = null,
  channelLogin,
  twitchUrl,
  title = "The title race gets serious.",
  description =
    "Two teams meet under the lights. Follow the broadcast, watch the standings shift, and see who owns the next chapter.",
}: FeaturedMatchupProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const embedParent = useSyncExternalStore(subscribeToEmbedParent, getEmbedParent, () => "localhost");
  const activeClip = clips[0] ?? null;
  const isLive = streamState === "live";
  const embedSrc = useMemo(() => {
    if (!embedParent) return null;
    if (isLive) {
      const params = new URLSearchParams({
        channel: channelLogin,
        parent: embedParent,
        autoplay: "true",
        muted: "true",
      });
      return `https://player.twitch.tv/?${params.toString()}`;
    }
    if (!activeClip) return null;
    const params = new URLSearchParams({
      clip: activeClip.slug,
      parent: embedParent,
      autoplay: "true",
      muted: "true",
    });
    return `https://clips.twitch.tv/embed?${params.toString()}`;
  }, [activeClip, channelLogin, embedParent, isLive]);

  const teamA = fixture?.team_a?.trim() || "TBD";
  const teamB = fixture?.team_b?.trim() || "TBD";

  return (
    <article aria-label="Featured matchup and Franchise Premier League broadcast" className="card-brand card-featured overflow-hidden p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="label-dash">FEATURED MATCHUP · {fixture?.stage?.replace("_", " ") ?? "NEXT"}</span>
          <h2 id="featured-matchup-title" className="type-display mt-2 text-4xl sm:text-5xl">
            {title}
          </h2>
        </div>
        {isLive ? (
          <span className="glow-pulse flex items-center gap-2 rounded-full border border-success/60 bg-success/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-success">
            <span aria-hidden className="h-2 w-2 rounded-full bg-success" />
            Live{typeof viewerCount === "number" ? ` · ${Intl.NumberFormat("en", { notation: "compact" }).format(viewerCount)} watching` : ""}
          </span>
        ) : (
          <span className="rounded-full border border-league-secondary/40 bg-league-secondary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-league-secondary">
            {fixture?.division ?? "FPL broadcast"}
          </span>
        )}
      </div>

      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
        {description}
      </p>

      <div className="mt-5 grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-lg border border-border-subtle bg-canvas/60 p-4">
          <span className="block text-[10px] uppercase tracking-[0.16em] text-muted">Team A</span>
          <strong className="mt-2 block text-xl text-white">{teamA}</strong>
        </div>
        <span className="text-center font-mono text-sm font-bold tracking-[0.12em] text-league-accent">VS</span>
        <div className="rounded-lg border border-border-subtle bg-canvas/60 p-4">
          <span className="block text-[10px] uppercase tracking-[0.16em] text-muted">Team B</span>
          <strong className="mt-2 block text-xl text-white">{teamB}</strong>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs uppercase tracking-[0.12em]">
        <span className={isLive ? "text-success" : "text-muted"}>{isLive ? "● On air now" : fixture?.scheduled_at ? formatKickoff(fixture.scheduled_at) : "Broadcast details coming soon"}</span>
        {fixture ? <span className="text-muted">Best of {fixture.best_of}</span> : null}
      </div>

      <div className="mt-4 rounded-lg border border-border-subtle bg-canvas/70">
        <button
          type="button"
          aria-expanded={previewOpen}
          onClick={() => setPreviewOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <span className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-success shadow-[0_0_0_4px_rgb(46_230_168_/_0.12)]" />
            <span>
              <strong className="block text-xs uppercase tracking-[0.1em] text-white">Twitch broadcast preview</strong>
              <span className="mt-1 block text-xs text-muted">Watch the desk, draft room, and live league coverage</span>
            </span>
          </span>
          <span className="shrink-0 text-xs uppercase tracking-[0.12em] text-action-text">
            {previewOpen ? "Hide preview −" : "Show preview ＋"}
          </span>
        </button>
        <div className="border-t border-border-subtle px-4 py-3 text-right">
          <a href={twitchUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-action-text hover:text-white">
            Open Twitch channel →
          </a>
        </div>
        {previewOpen ? (
          <div className="border-t border-border-subtle p-3">
            <div className="aspect-video overflow-hidden rounded border border-border-subtle bg-black">
              {embedSrc ? (
                <iframe
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full"
                  src={embedSrc}
                  title={isLive ? "Franchise Premier League live stream" : activeClip?.title ?? "Twitch broadcast preview"}
                />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">
                  Clips will appear here after they are available on Twitch.
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 text-xs text-muted">
              <span>
                {isLive
                  ? `Streaming live from Twitch${typeof viewerCount === "number" ? ` · ${Intl.NumberFormat("en", { notation: "compact" }).format(viewerCount)} watching` : ""}`
                  : activeClip
                    ? activeClip.title
                    : "Twitch clips"}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

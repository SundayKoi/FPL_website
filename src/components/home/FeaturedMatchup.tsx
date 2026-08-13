"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import type { TwitchClip, TwitchStreamState } from "@/lib/twitch/status";
import { formatKickoff } from "@/lib/schedule/format";
import type { FixtureRow } from "@/lib/schedule/types";

type FeaturedMatchupProps = {
  fixture: FixtureRow | null;
  clips: TwitchClip[];
  streamState: TwitchStreamState;
  channelLogin: string;
  twitchUrl: string;
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
  channelLogin,
  twitchUrl,
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
    <article aria-label="Featured matchup and Franchise Premier League broadcast" className="card-brand overflow-hidden p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="label-dash">FEATURED MATCHUP · {fixture?.stage?.replace("_", " ") ?? "NEXT"}</span>
          <h2 id="featured-matchup-title" className="type-display mt-2 text-4xl sm:text-5xl">
            The title race gets serious.
          </h2>
        </div>
        <span className="rounded-full border border-cyan/40 bg-cyan/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-cyan">
          {fixture?.division ?? "FPL broadcast"}
        </span>
      </div>

      <p className="mt-3 max-w-2xl text-sm leading-6 text-steel">
        Two teams meet under the lights. Follow the broadcast, watch the standings shift, and see who owns the next chapter.
      </p>

      <div className="mt-5 grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-lg border border-line bg-navy/60 p-4">
          <span className="block text-[10px] uppercase tracking-[0.16em] text-steel">Team A</span>
          <strong className="mt-2 block text-xl text-white">{teamA}</strong>
        </div>
        <span className="text-center font-mono text-sm font-bold tracking-[0.12em] text-gold">VS</span>
        <div className="rounded-lg border border-line bg-navy/60 p-4">
          <span className="block text-[10px] uppercase tracking-[0.16em] text-steel">Team B</span>
          <strong className="mt-2 block text-xl text-white">{teamB}</strong>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs uppercase tracking-[0.12em]">
        <span className={isLive ? "text-pink" : "text-steel"}>{isLive ? "● On air now" : fixture?.scheduled_at ? formatKickoff(fixture.scheduled_at) : "Broadcast details coming soon"}</span>
        {fixture ? <span className="text-steel">Best of {fixture.best_of}</span> : null}
      </div>

      <div className="mt-4 rounded-lg border border-line bg-navy/70">
        <button
          type="button"
          aria-expanded={previewOpen}
          onClick={() => setPreviewOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
        >
          <span className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-pink shadow-[0_0_0_4px_rgb(255_61_132_/_0.12)]" />
            <span>
              <strong className="block text-xs uppercase tracking-[0.1em] text-white">Twitch broadcast preview</strong>
              <span className="mt-1 block text-xs text-steel">Watch the desk, draft room, and live league coverage</span>
            </span>
          </span>
          <span className="shrink-0 text-xs uppercase tracking-[0.12em] text-cyan">
            {previewOpen ? "Hide preview −" : "Show preview ＋"}
          </span>
        </button>
        <div className="border-t border-line px-4 py-3 text-right">
          <a href={twitchUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-gold hover:text-white">
            Open Twitch channel →
          </a>
        </div>
        {previewOpen ? (
          <div className="border-t border-line p-3">
            <div className="aspect-video overflow-hidden rounded border border-line bg-black">
              {embedSrc ? (
                <iframe
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full"
                  src={embedSrc}
                  title={isLive ? "Franchise Premier League live stream" : activeClip?.title ?? "Twitch broadcast preview"}
                />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-steel">
                  Clips will appear here after they are available on Twitch.
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 text-xs text-steel">
              <span>{isLive ? "Streaming live from Twitch" : activeClip ? activeClip.title : "Twitch clips"}</span>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

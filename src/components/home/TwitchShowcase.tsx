"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { TwitchClip, TwitchStreamState } from "@/lib/twitch/status";

type TwitchShowcaseProps = {
  channelLogin: string;
  clips: TwitchClip[];
  streamState: TwitchStreamState;
  twitchUrl: string;
};

function getEmbedParent() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.location.hostname || "localhost";
}

function getServerEmbedParent() {
  return null;
}

function subscribeToEmbedParent() {
  return () => {};
}

function formatViews(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 10_000 ? 0 : 1)}k views`;
  return `${count} view${count === 1 ? "" : "s"}`;
}

/** Twitch clip thumbnails come sized in the URL (…-preview-480x272.jpg). */
function railThumb(url: string | null): string | null {
  return url?.replace(/-preview-\d+x\d+/, "-preview-260x147") ?? url;
}

export default function TwitchShowcase({
  channelLogin,
  clips,
  streamState,
  twitchUrl,
}: TwitchShowcaseProps) {
  const embedParent = useSyncExternalStore(
    subscribeToEmbedParent,
    getEmbedParent,
    getServerEmbedParent,
  );
  const [clipIndex, setClipIndex] = useState(0);
  const activeClip = clips.length ? clips[clipIndex % clips.length] : null;
  const isLive = streamState === "live";

  // auto-advance the reel: each clip holds the stage for its real duration
  useEffect(() => {
    if (isLive || clips.length < 2 || !activeClip) {
      return;
    }

    const timer = window.setTimeout(() => {
      setClipIndex((currentIndex) => (currentIndex + 1) % clips.length);
    }, activeClip.durationSeconds * 1000);

    return () => window.clearTimeout(timer);
  }, [activeClip, clips.length, isLive]);

  const embedSrc = useMemo(() => {
    if (!embedParent) {
      return null;
    }

    if (isLive) {
      const params = new URLSearchParams({
        channel: channelLogin,
        parent: embedParent,
        autoplay: "true",
        muted: "true",
      });

      return `https://player.twitch.tv/?${params.toString()}`;
    }

    if (!activeClip) {
      return null;
    }

    const params = new URLSearchParams({
      clip: activeClip.slug,
      parent: embedParent,
      autoplay: "true",
      muted: "true",
    });
    return `https://clips.twitch.tv/embed?${params.toString()}`;
  }, [activeClip, channelLogin, embedParent, isLive]);

  const showRail = !isLive && clips.length > 1;

  return (
    <article aria-labelledby="twitch-showcase-title" className="card-brand overflow-hidden p-0">
      <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
        <div>
          <span className="label-dash">FPL BROADCAST</span>
          <h2 id="twitch-showcase-title" className="mt-1 text-xl font-semibold text-white">
            Franchise Premier League broadcast
          </h2>
        </div>
        {isLive ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-red-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" />
            </span>
            Live now
          </span>
        ) : (
          <span className="inline-flex rounded-full border border-line px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-steel">
            Clip reel
          </span>
        )}
      </div>

      <div className={showRail ? "grid lg:grid-cols-[minmax(0,1fr)_240px]" : undefined}>
        {/* the stage */}
        <div>
          <div className="aspect-video bg-black">
            {embedSrc && (isLive || activeClip) ? (
              <iframe
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
                src={embedSrc}
                title={isLive ? "Franchise Premier League live stream" : activeClip?.title}
              />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-steel">
                Clips will appear here after they are available on Twitch.
              </div>
            )}
          </div>

          {/* now-playing strip */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-5 py-3 text-sm sm:px-6">
            {isLive ? (
              <span className="text-steel">Streaming live from Twitch</span>
            ) : activeClip ? (
              <>
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">
                  Now playing
                </span>
                <span className="min-w-0 flex-1 truncate text-white">{activeClip.title}</span>
                <span className="text-xs text-steel">
                  {activeClip.creatorName ? `clipped by ${activeClip.creatorName} · ` : ""}
                  {formatViews(activeClip.viewCount)}
                </span>
              </>
            ) : (
              <span className="text-steel">Twitch clips</span>
            )}
            <a
              href={twitchUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-auto font-semibold text-gold hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
            >
              Open Twitch channel
            </a>
          </div>
        </div>

        {/* the rundown: up-next rail (offline only) */}
        {showRail && (
          <aside
            aria-label="Up next"
            className="border-t border-line lg:border-l lg:border-t-0"
          >
            <div className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-steel">
              Up next
            </div>
            <ul className="flex gap-2 overflow-x-auto px-4 pb-4 lg:max-h-[340px] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden">
              {clips.map((clip, index) => {
                const active = index === clipIndex % clips.length;
                const thumb = railThumb(clip.thumbnailUrl);
                return (
                  <li key={clip.slug} className="w-40 shrink-0 lg:w-auto">
                    <button
                      type="button"
                      onClick={() => setClipIndex(index)}
                      aria-current={active ? "true" : undefined}
                      className={`group relative block w-full overflow-hidden rounded border text-left transition ${
                        active ? "border-gold" : "border-line hover:border-steel"
                      }`}
                    >
                      <div className="relative aspect-video bg-black/60">
                        {thumb && (
                          // eslint-disable-next-line @next/next/no-img-element -- twitch CDN thumbnails, remote domain not in next.config
                          <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                        )}
                        {active && (
                          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-black/50">
                            <div
                              key={clip.slug}
                              className="progress-fill h-full bg-gold"
                              style={{ animationDuration: `${clip.durationSeconds}s` }}
                            />
                          </div>
                        )}
                      </div>
                      <div className="px-2 py-1.5">
                        <div className={`truncate text-xs ${active ? "text-white" : "text-steel group-hover:text-white"}`}>
                          {clip.title}
                        </div>
                        <div className="text-[10px] text-steel/70">{formatViews(clip.viewCount)}</div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
        )}
      </div>
    </article>
  );
}

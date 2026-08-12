"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { TwitchStreamState } from "@/lib/twitch/status";

type TwitchClip = {
  slug: string;
  title: string;
  durationSeconds: number;
};

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

  return (
    <article
      aria-labelledby="twitch-showcase-title"
      className="card-brand overflow-hidden p-0"
    >
      <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
        <div>
          <span className="label-dash">FPL BROADCAST</span>
          <h2 id="twitch-showcase-title" className="mt-1 text-xl font-semibold text-white">
            Franchise Premier League broadcast
          </h2>
        </div>
        <span className="inline-flex rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-red-300">
          {isLive ? "Live now" : "Offline replay"}
        </span>
      </div>
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
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm text-steel sm:px-6">
        <span>{isLive ? "Streaming from Twitch" : activeClip?.title ?? "Twitch clips"}</span>
        <a
          href={twitchUrl}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-gold hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
        >
          Open Twitch channel
        </a>
      </div>
    </article>
  );
}

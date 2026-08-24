"use client";

import { useState } from "react";

export const STUART_PROFILE_IMAGE_URL = "/stuart-monkey.png";

export default function TweetIdentity({ date, compact = false }: { date: string; compact?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div className={`flex items-center gap-3 ${compact ? "gap-2" : ""}`}>
      {imageFailed ? (
        <div
          role="img"
          aria-label="Stuart69Davis profile picture"
          className={`flex shrink-0 items-center justify-center rounded-full border border-banana/60 bg-jungle text-xl shadow-[0_0_16px_rgba(245,182,46,0.18)] ${compact ? "h-8 w-8 text-base" : "h-10 w-10"}`}
        >
          🐒
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- local profile image asset
        <img
          src={STUART_PROFILE_IMAGE_URL}
          alt="Stuart69Davis profile picture"
          onError={() => setImageFailed(true)}
          className={`shrink-0 rounded-full border border-banana/60 object-cover shadow-[0_0_16px_rgba(245,182,46,0.18)] ${compact ? "h-8 w-8" : "h-10 w-10"}`}
        />
      )}
      <div>
        <p className={`font-display font-bold uppercase tracking-wide text-white ${compact ? "text-xs" : "text-sm"}`}>Stuart Davis</p>
        <p className="text-xs text-white/45">@Stuart69Davis · {date}</p>
      </div>
    </div>
  );
}

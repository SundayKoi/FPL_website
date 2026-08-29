"use client";

// The match, with bodies in it.
//
// Ten champion portraits on a stylised Rift, positioned by laneMap.ts from
// the same clock MatchTheatre is already running. Everything here is
// presentation over a settled outcome — the component decides nothing, and
// pausing or scrubbing the theatre moves the map with it.
//
// No sprites: the tokens are Riot's champion portraits, which every card
// already carries a champion for. That is the honest ceiling without
// commissioning art, and it still reads as five people fighting five.
//
// Movement is CSS transitions between two frames, not per-frame animation.
// The map only ever knows "where should everybody be for this beat", so a
// scrub backwards is as cheap as a scrub forwards, and a browser with
// reduced motion simply snaps.

import { useMemo } from "react";
import { championIconUrl } from "@/lib/match-draft/champions";
import { faceOf } from "@/lib/gauntlet/faces";
import { beatAt, laneFrame, PIT, THEIR_BASE, YOUR_BASE } from "@/lib/gauntlet/laneMap";
import type { GauntletCard, LaneResult, MatchEvent } from "@/lib/gauntlet/sim";

export default function LaneMap({
  events,
  lanes,
  yours,
  theirs,
  clock,
  reduced = false,
}: {
  events: MatchEvent[];
  lanes: LaneResult[];
  yours: GauntletCard[];
  theirs: GauntletCard[];
  clock: number;
  reduced?: boolean;
}) {
  const tokens = useMemo(
    () =>
      laneFrame({
        events,
        lanes,
        yours: yours.map((card) => ({ role: card.role, name: card.name, champion: faceOf(card) })),
        theirs: theirs.map((card) => ({ role: card.role, name: card.name, champion: faceOf(card) })),
        clock,
      }),
    [events, lanes, yours, theirs, clock],
  );
  const beat = useMemo(() => beatAt(events, clock), [events, clock]);
  const contested = beat?.kind === "baron";

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-line bg-[#04121f]"
      style={{ aspectRatio: "1 / 1" }}
      aria-label="The match, as a map"
      role="img"
    >
      {/* The Rift, drawn rather than fetched: three lanes, a river across
          the diagonal, and the pit. Nothing here is an asset to load. */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <linearGradient id="lm-river" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#0d3b52" />
            <stop offset="50%" stopColor="#155e7a" />
            <stop offset="100%" stopColor="#0d3b52" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill="#04121f" />
        <path d="M 0 100 L 100 0 L 100 18 L 18 100 Z" fill="url(#lm-river)" opacity="0.55" />
        {/* Top, mid and bot, as the paths the tokens actually walk. */}
        {[
          "M 8 92 L 8 30 L 40 8 L 92 8",
          "M 8 92 L 92 8",
          "M 8 92 L 70 92 L 92 60 L 92 8",
        ].map((d) => (
          <path key={`lane-${d}`} d={d} fill="none" stroke="#123a52" strokeWidth="6" strokeLinecap="round" />
        ))}
        <circle cx={PIT.x} cy={PIT.y} r="9" fill="#2a1636" stroke={contested ? "#b06ef0" : "#3a2350"} strokeWidth="1.2" />
        <circle cx={YOUR_BASE.x} cy={YOUR_BASE.y} r="7" fill="#0d3326" stroke="#2ee6a8" strokeWidth="1" />
        <circle cx={THEIR_BASE.x} cy={THEIR_BASE.y} r="7" fill="#33150d" stroke="#ff6b35" strokeWidth="1" />
      </svg>

      <span
        aria-hidden
        className="absolute font-display text-[9px] font-bold uppercase tracking-[0.2em] text-[#b06ef0]"
        style={{ left: `${PIT.x}%`, top: `${PIT.y + 11}%`, transform: "translate(-50%, 0)" }}
      >
        Pit
      </span>

      {tokens.map((token) => {
        const art = championIconUrl(token.champion);
        const mine = token.side === "yours";
        return (
          <span
            key={`${token.side}-${token.role}`}
            title={`${token.name} — ${token.role} (${token.champion})`}
            className="absolute grid place-items-center rounded-full border-2"
            style={{
              left: `${token.x}%`,
              top: `${token.y}%`,
              width: "13%",
              height: "13%",
              marginLeft: "-6.5%",
              marginTop: "-6.5%",
              borderColor: mine ? "#2ee6a8" : "#ff6b35",
              background: "#00172a",
              // The one line that makes it move. Two frames and a
              // transition, so a scrub is as cheap as a play.
              transition: reduced ? "none" : "left 620ms ease, top 620ms ease, opacity 260ms linear, filter 260ms linear",
              opacity: token.down ? 0.35 : 1,
              filter: token.down ? "grayscale(1)" : token.surging ? "brightness(1.15)" : "none",
              boxShadow: token.surging ? `0 0 12px ${mine ? "#2ee6a8" : "#ff6b35"}` : "none",
              zIndex: token.down ? 1 : 2,
            }}
          >
            {art ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={art} alt="" aria-hidden className="h-full w-full rounded-full object-cover" />
            ) : (
              <span className="text-[8px] font-bold text-steel">{token.role.slice(0, 3)}</span>
            )}
          </span>
        );
      })}

      {beat ? (
        <span className="absolute inset-x-0 bottom-0 truncate bg-[#00172a]/85 px-2 py-1 text-center text-[10px] text-steel">
          {beat.text}
        </span>
      ) : null}
    </div>
  );
}

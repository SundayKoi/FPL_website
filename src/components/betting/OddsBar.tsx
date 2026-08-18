"use client";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { BettingTeam } from "@/lib/betting/types";
import { fmtPoints } from "@/lib/betting/format";

/** ▲/▼ that flashes when the percentage moves, fading after a moment. */
function Movement({ pct }: { pct: number }) {
  const prev = useRef(pct);
  const [dir, setDir] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    if (pct === prev.current) return; // no change → nothing to flash
    setDir(pct > prev.current ? "up" : "down");
    prev.current = pct;
    const t = window.setTimeout(() => setDir(null), 2500);
    return () => window.clearTimeout(t);
  }, [pct]);
  if (!dir) return null;
  return (
    <span className={dir === "up" ? "text-mint" : "text-red-400"} aria-hidden="true">
      {dir === "up" ? "▲" : "▼"}
    </span>
  );
}

/** A single team's live odds bar: name, moneyline, volume, and a fill track. */
export function OddsBar({
  team,
  percent,
  volume,
  odds,
}: {
  team: BettingTeam;
  percent: number;
  volume: number;
  odds?: string;
}) {
  const pct = Math.round(percent * 100);
  const style = { "--team-color": team.color } as CSSProperties;
  return (
    <div
      className="mb-2 rounded-lg border border-line bg-panel p-3"
      style={style}
    >
      <div className="flex flex-wrap items-center gap-2">
        {team.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- external team logo, size not known ahead of time
          <img src={team.logo_url} alt="" width={28} height={28} className="rounded object-contain" />
        ) : (
          <span
            className="flex h-7 w-7 items-center justify-center rounded bg-navy text-[10px] font-semibold text-steel"
            style={{ color: team.color }}
          >
            {team.short_code.slice(0, 3)}
          </span>
        )}
        <span className="font-display text-sm not-italic text-white">{team.name}</span>
        {odds && (
          <span className="font-mono text-xs text-steel" title="moneyline odds">
            {odds}
          </span>
        )}
        <span className="ml-auto font-mono text-xs text-steel">VOL {fmtPoints(volume)}</span>
        <Movement pct={pct} />
        <span className="font-display text-sm font-bold not-italic" style={{ color: team.color }}>
          {pct}%
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-navy">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: team.color }} />
      </div>
    </div>
  );
}

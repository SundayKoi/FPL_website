import type { CSSProperties } from "react";

/**
 * Shared visual primitives for the neon-brand stats surface: bar graphs,
 * role-colored chips, and score tiers. Purely presentational — no data
 * logic — so these stay reusable across every tab without pulling in the
 * fetch/merge machinery each tab owns.
 */

export type NeonColor = "cyan" | "pink" | "purple" | "gold" | "green" | "red";

// Fill gradient + matching glow per accent. Kept as inline-style strings so
// the dynamic bar widths/colors don't depend on Tailwind seeing every class.
const FILL: Record<NeonColor, string> = {
  cyan: "linear-gradient(90deg,#0e7490,#35e6ff)",
  pink: "linear-gradient(90deg,#9d174d,#ff3d84)",
  purple: "linear-gradient(90deg,#6d28d9,#b06bff)",
  gold: "linear-gradient(90deg,#b8860b,#f5b62e)",
  green: "linear-gradient(90deg,#15803d,#34d399)",
  red: "linear-gradient(90deg,#991b1b,#f87171)",
};

const GLOW: Record<NeonColor, string> = {
  cyan: "0 0 12px rgb(53 230 255 / 0.45)",
  pink: "0 0 12px rgb(255 61 132 / 0.45)",
  purple: "0 0 12px rgb(176 107 255 / 0.45)",
  gold: "0 0 12px rgb(245 182 46 / 0.40)",
  green: "0 0 12px rgb(52 211 153 / 0.40)",
  red: "0 0 12px rgb(248 113 113 / 0.40)",
};

/** A single animated neon bar. `value`/`max` set the fill fraction (clamped 0–100%). */
export function StatBar({
  value,
  max,
  color = "cyan",
  className = "",
}: {
  value: number;
  max: number;
  color?: NeonColor;
  className?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const style: CSSProperties = {
    width: `${pct}%`,
    backgroundImage: FILL[color],
    boxShadow: GLOW[color],
  };
  return (
    <div className={`bar-track ${className}`}>
      <div className="bar-fill" style={style} />
    </div>
  );
}

// role_mode values from stats_player_agg: TOP / JUNGLE / MIDDLE / BOTTOM /
// UTILITY. Colors mirror the legacy dashboard's role palette.
const ROLE_META: Record<string, { chip: string; bar: NeonColor }> = {
  TOP: { chip: "text-red-300 border-red-400/40 bg-red-500/10", bar: "red" },
  JUNGLE: { chip: "text-emerald-300 border-emerald-400/40 bg-emerald-500/10", bar: "green" },
  MIDDLE: { chip: "text-cyan border-cyan/40 bg-cyan/10", bar: "cyan" },
  BOTTOM: { chip: "text-gold border-gold/40 bg-gold/10", bar: "gold" },
  UTILITY: { chip: "text-purple border-purple/40 bg-purple/10", bar: "purple" },
};

const ROLE_FALLBACK = { chip: "text-steel border-line bg-panel", bar: "cyan" as NeonColor };

/** Accent color for a role's bars/values. */
export function roleColor(role: string): NeonColor {
  return (ROLE_META[role] ?? ROLE_FALLBACK).bar;
}

/** A small role-colored pill (TOP / JUNGLE / …). */
export function RoleChip({ role, className = "" }: { role: string; className?: string }) {
  const meta = ROLE_META[role] ?? ROLE_FALLBACK;
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${meta.chip} ${className}`}
    >
      {role}
    </span>
  );
}

/** S/A/B/C tier badge for a 0–100 score (power ranking, MVP). */
export function tierFor(score: number): { label: string; className: string } {
  if (score >= 80) return { label: "S", className: "text-pink" };
  if (score >= 65) return { label: "A", className: "text-gold" };
  if (score >= 50) return { label: "B", className: "text-cyan" };
  return { label: "C", className: "text-steel" };
}

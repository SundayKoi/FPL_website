import type { CSSProperties, ReactNode } from "react";

/**
 * Shared visual primitives for the neon-brand stats surface: bar graphs,
 * role-colored chips, score tiers, filter pills, and the loading/error/
 * empty status cards. Purely presentational — no data
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
  JUNGLE: { chip: "text-mint border-mint/40 bg-mint/10", bar: "green" },
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

// Active-pill fill per accent. The cyan pills carry the neon glow (and the
// `transition` class they always had); PlayersTab's coral pills never had
// either, so the accent also gates those classes to keep each variant
// byte-identical to its pre-extraction markup.
const PILL_ACTIVE: Record<"cyan" | "coral", string> = {
  cyan: "bg-cyan text-navy [box-shadow:0_0_12px_rgb(53_230_255/0.4)]",
  coral: "bg-coral text-navy",
};

/** A rounded toggle-pill filter button (Top 10, min-games, role, phase chips). */
export function FilterPill({
  active,
  onClick,
  children,
  uppercase = false,
  accent = "cyan",
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  uppercase?: boolean;
  accent?: "cyan" | "coral";
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs font-semibold${uppercase ? " uppercase" : ""}${
        accent === "cyan" ? " transition" : ""
      } ${active ? PILL_ACTIVE[accent] : "border border-line bg-panel text-steel hover:text-white"}`}
    >
      {children}
    </button>
  );
}

/** The tabs' shared "still fetching" card. */
export function LoadingCard({ label }: { label: string }) {
  return (
    <div className="card-brand p-8 text-center text-steel" role="status">
      Loading {label}…
    </div>
  );
}

/** The tabs' shared fetch-failure card. */
export function ErrorCard({ noun }: { noun: string }) {
  return (
    <div className="card-brand p-8 text-center text-steel">
      Couldn&apos;t load {noun} data. Try again shortly.
    </div>
  );
}

/** The tabs' shared empty-state card (no data in scope / nothing matches the filters). */
export function EmptyCard({ title = "No stats yet", message }: { title?: string; message: string }) {
  return (
    <div className="card-brand p-8 text-center">
      <p className="type-display text-2xl">{title}</p>
      <p className="mt-2 text-steel">{message}</p>
    </div>
  );
}

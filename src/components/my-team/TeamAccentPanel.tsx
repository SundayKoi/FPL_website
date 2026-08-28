import type { ReactNode } from "react";

export function teamAccentFadeStyle(color: string) {
  return {
    background: `linear-gradient(90deg, ${color}, ${color}99 28%, transparent 82%)`,
    boxShadow: `0 0 18px ${color}66`,
  };
}

export default function TeamAccentPanel({
  color,
  children,
}: {
  color: string;
  children: ReactNode;
}) {
  return (
    <div className="relative min-w-0 pt-1">
      <span
        data-team-accent-fade
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-4 top-0 z-10 h-1.5 rounded-full"
        style={teamAccentFadeStyle(color)}
      />
      {children}
    </div>
  );
}

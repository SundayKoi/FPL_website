import type { ReactNode } from "react";

export default function TeamAccentPanel({
  color,
  children,
}: {
  color: string;
  children: ReactNode;
}) {
  return (
    <div className="relative min-w-0 pl-2">
      <span
        data-team-accent-rail
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-2 left-0 z-10 w-1 rounded-full"
        style={{
          backgroundColor: color,
          boxShadow: `0 0 20px ${color}aa, 0 0 6px ${color}`,
        }}
      />
      {children}
    </div>
  );
}

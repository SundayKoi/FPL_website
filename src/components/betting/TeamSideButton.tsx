"use client";
import type { CSSProperties, ReactNode } from "react";
import type { BettingTeam } from "@/lib/betting/types";

/** A team-colored side/pick button — selected fills with the team color,
 * unselected keeps the color on `--team-color` for hover styling. Shared by
 * BetPanel's side row and PickemPanel's LegRow. */
export function TeamSideButton({
  team,
  selected,
  onClick,
  disabled,
  className,
  children,
}: {
  team: BettingTeam;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  /** Extra classes appended to the shared set (e.g. LegRow's won-state ring). */
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        "flex-1 rounded border px-2 py-2 text-sm font-semibold transition disabled:cursor-not-allowed " +
        (selected ? "border-transparent text-canvas" : "border-border-strong text-muted hover:border-action-text") +
        (className ? ` ${className}` : "")
      }
      style={
        selected
          ? ({ backgroundColor: team.color } as CSSProperties)
          : ({ "--team-color": team.color } as CSSProperties)
      }
    >
      {children}
    </button>
  );
}

import type { FpldleFeedback } from "@/lib/fpldle/server";
import { boardGridClass, clueClass, clueLabel, positionText } from "./fpldleView";

export default function GuessRow({ feedback, showDivision }: { feedback: FpldleFeedback | null; showDivision: boolean }) {
  const gridClass = boardGridClass(showDivision);
  if (!feedback) {
    return (
      <div className={`${gridClass} rounded border border-border-subtle/60 bg-canvas/30 p-2 text-sm text-muted`}>
        <span className="flex min-w-0 items-center px-2">—</span>
        {Array.from({ length: showDivision ? 5 : 4 }, (_, index) => (
          <span key={index} className="flex min-w-0 min-h-12 items-center justify-center rounded border border-border-subtle/40 px-1">
            —
          </span>
        ))}
      </div>
    );
  }

  const cells = [
    { label: "Team", status: feedback.team },
    { label: "Role", status: feedback.position },
    { label: "Best champion", status: feedback.champion },
    { label: "Overall", status: feedback.overall },
    ...(showDivision ? [{ label: "Division", status: feedback.division }] : []),
  ];
  return (
    <div className={`${gridClass} overflow-hidden rounded border border-border-subtle bg-surface p-2 text-sm`}>
      <span className="flex min-w-0 min-h-12 items-center px-2 font-semibold text-white">
        <span className="min-w-0 truncate">{feedback.player.name}</span>
        <span className="ml-1 shrink-0 text-xs font-normal text-muted">#{feedback.player.tag}</span>
      </span>
      {cells.map((cell) => (
        <span
          key={cell.label}
          aria-label={clueLabel(cell.label, feedback)}
          className={`flex min-w-0 min-h-12 items-center justify-center overflow-hidden rounded border px-1 text-center text-xs font-semibold sm:text-sm ${clueClass(cell.status)}`}
        >
          {cell.label === "Team" ? (
            <span className="flex min-w-0 items-center justify-center gap-1.5">
              {feedback.teamLogoUrl ? (
                // Team logos come from the frozen card snapshot and may be hosted outside next/image remotePatterns.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={feedback.teamLogoUrl} alt="" width={24} height={24} className="h-6 w-6 shrink-0 rounded object-contain" />
              ) : null}
            <span className="min-w-0 truncate">{feedback.teamName}</span>
            </span>
          ) : cell.label === "Role" ? (
            positionText(feedback.positionName)
          ) : cell.label === "Best champion" ? (
            <span className="min-w-0 truncate">{feedback.championName}</span>
          ) : cell.label === "Overall" ? (
            <span className="min-w-0 break-words">{feedback.overallValue} {feedback.overall === "equal" ? "· Equal" : feedback.overall === "higher" ? "· ↑ Higher" : "· ↓ Lower"}</span>
          ) : (
            feedback.divisionName ?? "Unassigned"
          )}
        </span>
      ))}
    </div>
  );
}

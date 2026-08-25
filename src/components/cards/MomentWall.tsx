// The wall of moments: one engraved plate per minted performance.
//
// The plate design itself lives in MomentPlate; this is the shelf it sits
// on, plus the empty state — which says WHY it is empty, because "no
// moments yet" and "these are hard to get" are the same sentence here.

import MomentPlate from "./MomentPlate";
import type { LeagueMoment } from "@/lib/cards/queries";

export default function MomentWall({
  moments,
  season,
}: {
  moments: LeagueMoment[];
  season?: string | null;
}) {
  if (moments.length === 0) {
    return (
      <p className="text-sm text-steel">
        No moments yet. They mint after a week&apos;s games — and only the rarest few of what happened.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap justify-center gap-6 sm:justify-start">
      {moments.map((moment) => (
        // The cap lives here, not in the plate: this is a flex row, so an
        // uncapped plate would stretch across the whole line.
        <MomentPlate key={moment.id} moment={moment} season={season} className="max-w-[16rem]" />
      ))}
    </div>
  );
}

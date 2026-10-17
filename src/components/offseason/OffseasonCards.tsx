// Offseason card copies: the league's own card renderer, with the finish the
// copy pulled (one foil type, shiny, signed) read from the copy itself.

import PlayerCard3D from "@/components/cards/PlayerCard3D";
import { OFFSEASON_FOIL_TYPE, type OffseasonCopy } from "@/lib/offseason/packs";

const CHIP = "rounded-full border border-gold/50 bg-gold/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold";

export function OffseasonCopyCell({ copy, reveal = false }: { copy: OffseasonCopy; reveal?: boolean }) {
  const finishes = [copy.signed && "Signed", copy.foil && "Foil", copy.shiny && "Shiny"].filter((finish): finish is string => Boolean(finish));
  return (
    <div className="card-cell flex flex-col items-center gap-2">
      <PlayerCard3D card={copy.card} interactive reveal={reveal} forceFoil={copy.foil} foilType={copy.foil ? OFFSEASON_FOIL_TYPE : null} />
      <p className="flex flex-wrap items-center justify-center gap-1.5 text-xs">
        <span className="font-semibold text-white">{copy.card.name}</span>
        <span className="text-muted">Week {copy.weekNumber}</span>
        {finishes.map((finish) => (
          <span key={finish} className={CHIP}>
            {finish}
          </span>
        ))}
      </p>
    </div>
  );
}

export function OffseasonCardShelf({ copies, reveal = false }: { copies: OffseasonCopy[]; reveal?: boolean }) {
  return (
    <div className="card-shelf flex flex-wrap justify-center gap-x-0 gap-y-4">
      {copies.map((copy) => (
        <OffseasonCopyCell key={copy.id} copy={copy} reveal={reveal} />
      ))}
    </div>
  );
}

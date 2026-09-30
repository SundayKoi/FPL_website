// The caption under a turned card in the pack opening's line: its name, its
// badges, and — on the summary — its dust chip. Rendered only by
// PackOpening, a client component, so it carries no directive of its own.

import { fmtPoints } from "@/lib/betting/format";
import { canDust } from "@/lib/packs/config";
import { isAltArt, type Pull } from "./packOpeningModel";

export default function PackPullCaption({
  pull,
  isNew,
  showDust,
  dusted,
  picked,
  selling,
  dustValue,
  onTogglePick,
}: {
  pull: Pull;
  isNew: boolean;
  /** Whether the dust chip shows at all: a sellable stage, on the summary. */
  showDust: boolean;
  /** This copy has already been destroyed out of the pack. */
  dusted: boolean;
  /** This copy is ticked for dusting. */
  picked: boolean;
  selling: boolean;
  dustValue: number;
  onTogglePick: () => void;
}) {
  return (
    <div className="flex max-w-[13rem] flex-wrap items-center justify-center gap-1 text-center">
      <span className="w-full truncate text-xs font-semibold text-white">{pull.card?.name ?? pull.displayName ?? "Collectible"}</span>
      {isNew ? (
        <span className="rounded-full border border-mint bg-mint/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-mint">
          New
        </span>
      ) : null}
      {pull.signed ? (
        <span
          title="Autographed"
          className="rounded-full border border-gold bg-gold/20 px-2 py-0.5 text-[9px] font-black text-gold"
        >
          ✍
        </span>
      ) : null}
      {pull.foil ? (
        <span
          title="Foil"
          className="rounded-full border border-gold/50 bg-gold/10 px-2 py-0.5 text-[9px] font-black text-gold"
        >
          ✦
        </span>
      ) : null}
      {isAltArt(pull) ? (
        <span
          title="Alternate print"
          className="rounded-full border border-cyan/50 bg-cyan/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-cyan"
        >
          Alt
        </span>
      ) : null}
      {pull.card?.shiny ? (
        <span
          title="Shiny — the art in the wrong colours"
          className="rounded-full border border-[#ff9be7]/60 bg-[#ff9be7]/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-[#ffd1f3]"
        >
          Shiny
        </span>
      ) : null}
      {pull.card?.secret ? (
        <span
          title={`Secret — numbered past the checklist, #${pull.card.secret.number}/${pull.card.secret.of}`}
          className="rounded-full border border-gold bg-gold/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-gold"
        >
          Secret
        </span>
      ) : null}
      {pull.card?.stattrak ? (
        <span
          title="StatTrak — counts the fantasy points it scores for you"
          className="rounded-full border border-[#ff8a2a]/60 bg-[#ff8a2a]/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-[#ff8a2a]"
        >
          StatTrak
        </span>
      ) : null}
      {/* Picking happens on the SUMMARY, not mid-reveal: a
          dust chip next to a card still being turned is a
          destructive control competing with the moment the
          pack exists for. */}
      {showDust ? (
        dusted ? (
          <span className="w-full rounded-full border border-border-subtle px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
            Dusted
          </span>
        ) : !canDust(pull) ? (
          <span
            title="An Eclipse is a one-of-one — it can't be dusted, but you can trade it."
            className="w-full rounded-full border border-gold/60 bg-gold/10 px-2 py-0.5 text-center text-[10px] font-black uppercase tracking-[0.18em] text-gold"
          >
            1 of 1
          </span>
        ) : (
          <button
            type="button"
            aria-pressed={picked}
            onClick={onTogglePick}
            disabled={selling}
            className={`w-full rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide transition disabled:opacity-60 ${
              picked
                ? "border-gold bg-gold/20 text-gold"
                : "border-border-subtle text-muted hover:border-gold hover:text-gold"
            }`}
          >
            {picked ? "✓ " : ""}Dust +{fmtPoints(dustValue)}
          </button>
        )
      ) : null}
    </div>
  );
}

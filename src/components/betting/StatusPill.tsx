// Ported from c:\fpl_gambling\web\src\components\StatusPill.tsx (class-name
// map -> Tailwind token map). Shared by MarketCard and MarketDetail so the
// four status colors are defined in exactly one place.
const STATUS_STYLE: Record<string, string> = {
  OPEN: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  LOCKED: "border-gold/40 bg-gold/10 text-gold",
  RESOLVED: "border-steel/40 bg-steel/10 text-steel",
  CANCELLED: "border-red-400/40 bg-red-400/10 text-red-300",
};

/** A market's status badge — OPEN/LOCKED/RESOLVED/CANCELLED. Unrecognized
 * values fall back to the RESOLVED (neutral steel) style. */
export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={
        "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
        (STATUS_STYLE[status] ?? STATUS_STYLE.RESOLVED)
      }
    >
      {status}
    </span>
  );
}

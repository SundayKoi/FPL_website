export type TickerTone = "coral" | "mint" | "gold" | "cyan" | "pink";

export type TickerItem = {
  key: string;
  label: string;
  text: string;
  tone?: TickerTone;
};

const TONE_CLASS: Record<TickerTone, string> = {
  coral: "text-coral",
  mint: "text-mint",
  gold: "text-gold",
  cyan: "text-cyan",
  pink: "text-pink",
};

/**
 * The broadcast-style ticker strip at the top of the homepage. Pure CSS
 * marquee (see ticker-track in globals.css): the item list renders twice so
 * the loop is seamless; hover pauses it; reduced-motion shows it static.
 */
export default function LiveTicker({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null;

  const half = (copy: number) => (
    <div aria-hidden={copy === 1} className="flex w-max items-center">
      {items.map((item) => (
        <span key={`${copy}-${item.key}`} className="flex items-center gap-2 pr-10 text-xs">
          <span
            className={`whitespace-nowrap font-semibold uppercase tracking-[0.18em] ${TONE_CLASS[item.tone ?? "coral"]}`}
          >
            {item.label}
          </span>
          <span className="whitespace-nowrap text-steel">{item.text}</span>
        </span>
      ))}
    </div>
  );

  return (
    <div
      aria-label="League ticker"
      className="ticker-mask overflow-hidden rounded border border-gold/30 bg-navy/85 py-2"
    >
      <div className="ticker-track flex w-max motion-reduce:w-full motion-reduce:overflow-x-auto">
        {half(0)}
        {half(1)}
      </div>
    </div>
  );
}

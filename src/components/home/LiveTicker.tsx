import type { HomeAppearance } from "./appearance";
import styles from "./HomeWorkspace.module.css";

export type TickerTone = "coral" | "mint" | "gold" | "cyan" | "pink";

export type TickerItem = {
  key: string;
  label: string;
  text: string;
  tone?: TickerTone;
};

const TONE_CLASS: Record<TickerTone, string> = {
  coral: "text-league-accent",
  mint: "text-success",
  gold: "text-prestige",
  cyan: "text-cyan",
  pink: "text-pink",
};

/**
 * The broadcast-style ticker strip at the top of the homepage. Pure CSS
 * marquee (see ticker-track in globals.css): the item list renders twice so
 * the loop is seamless; hover pauses it; reduced-motion shows it static.
 */
export default function LiveTicker({ items, appearance = "legacy" }: { items: TickerItem[]; appearance?: HomeAppearance }) {
  if (items.length === 0) return null;
  const workspace = appearance === "workspace";

  const half = (copy: number) => (
    <div aria-hidden={copy === 1} className="flex w-max items-center">
      {items.map((item) => (
        <span key={`${copy}-${item.key}`} className={workspace ? styles.statusItem : "flex items-center gap-2 pr-10 text-xs"}>
          <span
            className={`whitespace-nowrap font-semibold uppercase tracking-[0.18em] ${TONE_CLASS[item.tone ?? "coral"]}`}
          >
            {item.label}
          </span>
          <span className="whitespace-nowrap text-muted">{item.text}</span>
        </span>
      ))}
    </div>
  );

  return (
    <div
      aria-label="League ticker"
      role={workspace ? "region" : undefined}
      className={workspace ? styles.statusStrip : "ticker-mask overflow-hidden rounded border border-league-accent/30 bg-canvas/85 py-2"}
    >
      {workspace ? (
        <div className={styles.tickerLine}>
          <div className={styles.tickerViewport}>
            <div className={styles.statusTrack}>
              {half(0)}
              {half(1)}
            </div>
          </div>
          <label className={styles.tickerToggle}>
            <input type="checkbox" aria-label="Pause the moving league ticker" />
            <span className={styles.pauseLabel}>Pause</span>
            <span className={styles.resumeLabel}>Resume</span>
          </label>
        </div>
      ) : (
        <div className="ticker-track flex w-max motion-reduce:w-full motion-reduce:overflow-x-auto">
          {half(0)}
          {half(1)}
        </div>
      )}
    </div>
  );
}

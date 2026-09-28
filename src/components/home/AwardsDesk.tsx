import type { HomepageAward, HomepageAwardsData } from "@/lib/home/awards";
import type { HomeAppearance } from "./appearance";
import styles from "./HomeWorkspace.module.css";

type AwardsDeskProps = {
  awards: HomepageAwardsData;
  /** The Premier homepage gives this award its own prominent, period-matched spotlight. */
  omitPlayerOfWeekHero?: boolean;
};

function winnerName(award: HomepageAward): string {
  return award.name ?? award.teamName ?? "Unavailable";
}

function winnerMeta(award: HomepageAward): string {
  if (award.name && award.teamName) return award.teamName;
  return award.detail;
}

function AwardRow({ award, icon, appearance }: { award: HomepageAward; icon: string; appearance: HomeAppearance }) {
  const workspace = appearance === "workspace";
  return (
    <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-t border-border-subtle/60 py-3 first:border-t-2 first:border-prestige/70 first:bg-prestige/5">
      <span className="flex h-7 w-7 items-center justify-center rounded-md border border-border-subtle text-xs font-bold text-prestige">
        {icon}
      </span>
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${workspace ? styles.ink : "text-white"}`}>{award.title}</p>
        <p className="truncate text-xs text-muted">{winnerName(award)} · {winnerMeta(award)}</p>
      </div>
      <span className="whitespace-nowrap text-right font-mono text-xs font-semibold text-cyan">
        {award.value}
      </span>
    </div>
  );
}

function Metric({ label, value, appearance }: { label: string; value: string; appearance: HomeAppearance }) {
  const workspace = appearance === "workspace";
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border-subtle/60 py-2.5">
      <span className={`text-sm ${workspace ? styles.muted : "text-muted"}`}>{label}</span>
      <span className="font-mono text-sm font-semibold text-prestige">{value}</span>
    </div>
  );
}

export default function AwardsDesk({
  awards,
  appearance = "legacy",
  omitPlayerOfWeekHero = false,
}: AwardsDeskProps & { appearance?: HomeAppearance }) {
  const workspace = appearance === "workspace";
  return (
    <section
      aria-labelledby="awards-desk-title"
      className={workspace ? styles.openSection : "card-brand mt-6 overflow-hidden p-5 sm:p-6 xl:mt-8"}
      data-appearance={appearance}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className={workspace ? styles.eyebrow : "label-dash"}>OFFICIAL {awards.season} HONORS</span>
          <h2 id="awards-desk-title" className={workspace ? `${styles.title} mt-2 text-4xl sm:text-5xl` : "type-display mt-2 text-4xl sm:text-5xl"}>
            The Awards Desk
          </h2>
        </div>
        <p className={`max-w-sm text-right text-sm leading-6 ${workspace ? styles.muted : "text-muted"}`}>
          The players and franchises defining {awards.periodLabel}.
        </p>
      </div>

      <div className={`mt-5 grid gap-5 ${omitPlayerOfWeekHero ? "lg:grid-cols-1" : "lg:grid-cols-[1.2fr_0.8fr]"}`}>
        {!omitPlayerOfWeekHero ? <article className={workspace ? `${styles.softPanel} ${styles.awardHero}` : "relative overflow-hidden rounded-lg border border-border-subtle bg-gradient-to-br from-surface to-canvas p-5"}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <span className={workspace ? styles.eyebrow : "label-dash"}>INDIVIDUAL HONOR</span>
            <span className="rounded-full border border-prestige/50 bg-prestige/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-prestige">
              {awards.playerOfWeek.title}
            </span>
          </div>
          <h3 className={workspace ? `${styles.title} mt-4 max-w-lg text-3xl sm:text-4xl` : "type-display mt-4 max-w-lg text-3xl sm:text-4xl"}>
            {winnerName(awards.playerOfWeek)}
          </h3>
          <p className={`mt-2 max-w-lg text-sm leading-6 ${workspace ? styles.muted : "text-muted"}`}>{awards.playerOfWeek.detail}</p>
          <div className="mt-5 flex items-center gap-3">
            <span className={`flex h-11 w-11 items-center justify-center rounded-full border border-cyan/60 bg-canvas font-mono text-xs font-bold text-cyan ${workspace ? "rounded" : ""}`}>
              {awards.playerOfWeek.name?.slice(0, 3).toUpperCase() ?? "—"}
            </span>
            <div>
              <p className={`text-lg font-semibold ${workspace ? styles.ink : "text-white"}`}>{winnerName(awards.playerOfWeek)}</p>
              <p className={`text-xs uppercase tracking-[0.12em] ${workspace ? styles.muted : "text-muted"}`}>{winnerMeta(awards.playerOfWeek)}</p>
            </div>
          </div>
          <div className={workspace ? styles.awardValue : "absolute bottom-5 right-5 text-right"}>
            <p className={workspace ? `${styles.title} text-4xl text-cyan` : "type-display text-4xl text-cyan"}>{awards.playerOfWeek.value}</p>
            <p className={`text-[10px] uppercase tracking-[0.16em] ${workspace ? styles.muted : "text-muted"}`}>Weekly power</p>
          </div>
        </article> : null}

        <article className={workspace ? styles.awardSummary : "rounded-lg border border-border-subtle bg-surface p-5"}>
          <span className={workspace ? styles.eyebrow : "label-dash"}>FRANCHISE HONOR</span>
          <h3 className={workspace ? `${styles.title} mt-3 text-3xl` : "type-display mt-3 text-3xl"}>{awards.teamOfWeek.title}</h3>
          <div className="mt-4">
            <Metric label="Winner" value={winnerName(awards.teamOfWeek)} appearance={appearance} />
            <Metric label="Weekly record" value={awards.teamOfWeek.value} appearance={appearance} />
            <Metric label="Metric" value={awards.teamOfWeek.detail} appearance={appearance} />
          </div>
        </article>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className={workspace ? `${styles.softPanel} p-4` : "rounded-lg border border-border-subtle bg-canvas/60 p-4"}>
          <span className={workspace ? styles.eyebrow : "label-dash"}>INDIVIDUAL HONORS</span>
          <h3 className={`mt-2 text-xl font-semibold uppercase tracking-tight ${workspace ? styles.ink : "text-white"}`}>Players setting the pace</h3>
          <div className="mt-3">
            {awards.individualAwards.length > 0 ? awards.individualAwards.map((award, index) => (
              <AwardRow key={award.title} award={award} icon={["◆", "✦", "↗", "◎"][index] ?? "•"} appearance={appearance} />
            )) : workspace ? <p className={`border-t border-border-subtle/60 py-3 text-sm ${styles.muted}`}>No individual honors are available for this period.</p> : null}
          </div>
        </div>

        <div className={workspace ? `${styles.softPanel} p-4` : "rounded-lg border border-border-subtle bg-canvas/60 p-4"}>
          <span className={workspace ? styles.eyebrow : "label-dash"}>TEAM HONORS</span>
          <h3 className={`mt-2 text-xl font-semibold uppercase tracking-tight ${workspace ? styles.ink : "text-white"}`}>Franchises on the move</h3>
          <div className="mt-3">
            {awards.teamAwards.length > 0 ? awards.teamAwards.map((award, index) => (
              <AwardRow key={award.title} award={award} icon={["01", "↗", "≈", "✓"][index] ?? "•"} appearance={appearance} />
            )) : workspace ? <p className={`border-t border-border-subtle/60 py-3 text-sm ${styles.muted}`}>No team honors are available for this period.</p> : null}
          </div>
        </div>
      </div>

      <p className={`mt-4 text-[10px] uppercase tracking-[0.1em] ${workspace ? styles.muted : "text-muted/70"}`}>
        Awards calculated from stored {awards.season} match data · Updated after each completed week
      </p>
    </section>
  );
}

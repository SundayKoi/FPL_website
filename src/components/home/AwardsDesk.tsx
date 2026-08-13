import type { HomepageAward, HomepageAwardsData } from "@/lib/home/awards";

type AwardsDeskProps = {
  awards: HomepageAwardsData;
};

function winnerName(award: HomepageAward): string {
  return award.name ?? award.teamName ?? "Unavailable";
}

function winnerMeta(award: HomepageAward): string {
  if (award.name && award.teamName) return award.teamName;
  return award.detail;
}

function AwardRow({ award, icon }: { award: HomepageAward; icon: string }) {
  return (
    <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-t border-line/60 py-3 first:border-t-2 first:border-gold/70 first:bg-gold/5">
      <span className="flex h-7 w-7 items-center justify-center rounded-md border border-line text-xs font-bold text-gold">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">{award.title}</p>
        <p className="truncate text-xs text-steel">{winnerName(award)} · {winnerMeta(award)}</p>
      </div>
      <span className="whitespace-nowrap text-right font-mono text-xs font-semibold text-cyan">
        {award.value}
      </span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line/60 py-2.5">
      <span className="text-sm text-steel">{label}</span>
      <span className="font-mono text-sm font-semibold text-gold">{value}</span>
    </div>
  );
}

export default function AwardsDesk({ awards }: AwardsDeskProps) {
  return (
    <section
      aria-labelledby="awards-desk-title"
      className="card-brand mt-6 overflow-hidden p-5 sm:p-6 xl:mt-8"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label-dash">OFFICIAL {awards.season} HONORS</span>
          <h2 id="awards-desk-title" className="type-display mt-2 text-4xl sm:text-5xl">
            The Awards Desk
          </h2>
        </div>
        <p className="max-w-sm text-right text-sm leading-6 text-steel">
          The players and franchises defining {awards.periodLabel}.
        </p>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="relative overflow-hidden rounded-lg border border-line bg-gradient-to-br from-panel to-navy p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <span className="label-dash">INDIVIDUAL HONOR</span>
            <span className="rounded-full border border-gold/50 bg-gold/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gold">
              {awards.playerOfWeek.title}
            </span>
          </div>
          <h3 className="type-display mt-4 max-w-lg text-3xl sm:text-4xl">
            Control the map. Own the week.
          </h3>
          <p className="mt-2 max-w-lg text-sm leading-6 text-steel">{awards.playerOfWeek.detail}</p>
          <div className="mt-5 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-cyan/60 bg-navy font-mono text-xs font-bold text-cyan">
              {awards.playerOfWeek.name?.slice(0, 3).toUpperCase() ?? "—"}
            </span>
            <div>
              <p className="text-lg font-semibold text-white">{winnerName(awards.playerOfWeek)}</p>
              <p className="text-xs uppercase tracking-[0.12em] text-steel">{winnerMeta(awards.playerOfWeek)}</p>
            </div>
          </div>
          <div className="absolute bottom-5 right-5 text-right">
            <p className="type-display text-4xl text-cyan">{awards.playerOfWeek.value}</p>
            <p className="text-[10px] uppercase tracking-[0.16em] text-steel">Weekly power</p>
          </div>
        </article>

        <article className="rounded-lg border border-line bg-panel p-5">
          <span className="label-dash">FRANCHISE HONOR</span>
          <h3 className="type-display mt-3 text-3xl">{awards.teamOfWeek.title}</h3>
          <div className="mt-4">
            <Metric label="Winner" value={winnerName(awards.teamOfWeek)} />
            <Metric label="Weekly record" value={awards.teamOfWeek.value} />
            <Metric label="Metric" value={awards.teamOfWeek.detail} />
          </div>
        </article>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-line bg-navy/60 p-4">
          <span className="label-dash">INDIVIDUAL HONORS</span>
          <h3 className="mt-2 text-xl font-semibold uppercase tracking-tight text-white">Players setting the pace</h3>
          <div className="mt-3">
            {awards.individualAwards.map((award, index) => (
              <AwardRow key={award.title} award={award} icon={["◆", "✦", "↗", "◎"][index] ?? "•"} />
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-line bg-navy/60 p-4">
          <span className="label-dash">TEAM HONORS</span>
          <h3 className="mt-2 text-xl font-semibold uppercase tracking-tight text-white">Franchises on the move</h3>
          <div className="mt-3">
            {awards.teamAwards.map((award, index) => (
              <AwardRow key={award.title} award={award} icon={["01", "↗", "≈", "✓"][index] ?? "•"} />
            ))}
          </div>
        </div>
      </div>

      <p className="mt-4 text-[10px] uppercase tracking-[0.1em] text-steel/70">
        Awards calculated from stored {awards.season} match data · Updated after each completed week
      </p>
    </section>
  );
}

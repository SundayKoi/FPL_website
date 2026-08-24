// The wall of moments: one plaque per minted performance.
//
// Not a PlayerCard3D — a moment is a stat line and a date, not a rating, and
// dressing it as a player card would imply an overall it does not have.

import Link from "next/link";
import { championIconUrl } from "@/lib/match-draft/champions";
import type { LeagueMoment } from "@/lib/cards/queries";

/** "2026-08-24" -> "Aug 24". Read as UTC: the stored value is a plain
 *  calendar date, and letting the browser's zone parse it slides a chunk of
 *  the world back a day. */
function weekLabel(week: string): string {
  const date = new Date(`${week}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return week;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default function MomentWall({ moments }: { moments: LeagueMoment[] }) {
  if (moments.length === 0) {
    return (
      <p className="text-sm text-steel">
        No moments yet. They mint after a week&apos;s games — and only the rarest few of what happened.
      </p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {moments.map((moment) => (
        <article key={moment.id} aria-label={`${moment.title} — ${moment.summonerName}`} className="card-brand flex gap-4 p-5">
          {moment.champion && championIconUrl(moment.champion) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={championIconUrl(moment.champion)!}
              alt=""
              className="h-16 w-16 shrink-0 rounded-lg border border-line object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-gold">{moment.title}</span>
            <h3 className="mt-1 truncate font-display text-xl font-semibold text-white">
              <Link href={`/card/${moment.slug}`} className="underline-offset-4 hover:text-coral hover:underline">
                {moment.summonerName}
              </Link>
            </h3>
            <p className="mt-1 text-sm leading-6 text-steel">{moment.headline}</p>
            <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-steel">
              {moment.champion ? `${moment.champion} · ` : ""}
              {moment.teamName ? `${moment.teamName} · ` : ""}
              Week of {weekLabel(moment.weekStart)}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}

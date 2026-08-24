// One moment, printed as an engraved award plate.
//
// Deliberately not a PlayerCard3D. A moment has no rating, no tier and no
// pack to pull it from, so printing it as a player card would promise an
// overall it does not have. The plate is the other reading: a commendation
// for something that happened, which is what a card nobody can buy should
// feel like.
//
// Server-renderable — there is nothing to interact with. The champion sits
// in a struck medallion rather than as splash art behind the text: a full
// splash under a gold plate turns to mud, and the medallion is how a real
// plaque carries a likeness.

import Link from "next/link";
import { championIconUrl } from "@/lib/match-draft/champions";
import type { LeagueMoment } from "@/lib/cards/queries";

/** "2026-08-24" -> "Aug 24". Read as UTC: the stored value is a plain
 *  calendar date, and letting the browser's zone parse it slides a chunk of
 *  the world back a day. */
export function weekLabel(week: string): string {
  const date = new Date(`${week}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return week;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** The divider under the trigger — a struck rule with a centred lozenge,
 *  the plaque equivalent of the card's accent-rule. */
function Laurel() {
  return (
    <svg width="58" height="10" viewBox="0 0 58 10" aria-hidden="true" className="my-1.5">
      <path
        d="M1 5 H21 M37 5 H57 M29 1 L32 5 L29 9 L26 5 Z"
        fill="none"
        stroke="#3a2a08"
        strokeWidth="1.4"
      />
    </svg>
  );
}

export default function MomentPlate({ moment, season }: { moment: LeagueMoment; season?: string | null }) {
  const icon = moment.champion ? championIconUrl(moment.champion) : null;

  return (
    <article
      aria-label={`${moment.title} — ${moment.summonerName}`}
      className="moment-plate relative flex aspect-[5/7] w-full max-w-[16rem] flex-col overflow-hidden rounded-xl"
    >
      <span className="moment-brush" />
      <span className="moment-bevel" />

      <div className="relative z-10 flex h-full flex-col items-center px-4 py-4 text-center">
        <span className="font-body text-[0.58rem] uppercase tracking-[0.18em] text-[#b79a56]">
          {season ? `Season ${season} · ` : ""}Moment
        </span>

        {icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={icon}
            alt=""
            className="mt-4 h-20 w-20 rounded-full border-2 border-[#d8b055] object-cover sepia-[0.55] saturate-75"
            style={{ boxShadow: "0 2px 8px rgb(0 0 0 / 0.55), inset 0 0 12px rgb(0 0 0 / 0.5)" }}
            loading="lazy"
            decoding="async"
          />
        ) : null}

        <h3 className="moment-engrave mt-auto font-engrave text-lg font-black uppercase leading-tight tracking-[0.06em] text-[#fff4d2]">
          {moment.title}
        </h3>

        <Laurel />

        <Link
          href={`/card/${moment.slug}`}
          className="moment-engrave font-engrave text-base font-bold text-[#fffaf0] underline-offset-4 hover:underline"
        >
          {moment.summonerName}
        </Link>

        <p className="mt-1 font-body text-[0.72rem] leading-snug text-[#e2cd94]">{moment.headline}</p>

        <p className="mt-2 font-body text-[0.56rem] uppercase tracking-[0.14em] text-[#b79a56]">
          {moment.champion ? `${moment.champion} · ` : ""}
          {moment.teamName ? `${moment.teamName} · ` : ""}
          Week of {weekLabel(moment.weekStart)}
        </p>
      </div>
    </article>
  );
}

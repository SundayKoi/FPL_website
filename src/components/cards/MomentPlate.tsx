// One moment, printed as its Signature card.
//
// Deliberately not a PlayerCard3D — a moment has no rating or tier, and
// promising an overall it doesn't have is how the old plaque design went
// wrong in the other direction. This is the chase-card reading instead:
// full-bleed splash of the champion it happened on, the trigger struck
// across a metal ribbon in its family's colorway, a serial chip, and the
// broadcast provenance row (REC, game clock) that says THIS HAPPENED.
//
// Server-renderable — there is nothing to interact with. Copies frozen
// before the redesign carry no triggerKey/opponent/clock; every one of
// those degrades by omission (fallback family, no clock, no opponent)
// rather than by lying.

import Link from "next/link";
import { championSplashUrl } from "@/lib/match-draft/champions";
import { gameClock, mintOrdinal, momentFamilyOf, type MomentFamily } from "@/lib/cards/moments";
import type { LeagueMoment } from "@/lib/cards/queries";

// Written out as full literals — Tailwind emits a utility only when the
// class name appears somewhere in source, so `sig-art-${family}` would
// silently produce unstyled cards.
const FAMILY_ART: Record<MomentFamily, string> = {
  ember: "sig-art-ember",
  void: "sig-art-void",
  ice: "sig-art-ice",
  gold: "sig-art-gold",
};
const FAMILY_RIBBON: Record<MomentFamily, string> = {
  ember: "sig-ribbon-ember",
  void: "sig-ribbon-void",
  ice: "sig-ribbon-ice",
  gold: "sig-ribbon-gold",
};

/** "2026-08-24" -> "Aug 24". Read as UTC: the stored value is a plain
 *  calendar date, and letting the browser's zone parse it slides a chunk of
 *  the world back a day. */
export function weekLabel(week: string): string {
  const date = new Date(`${week}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return week;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default function MomentPlate({
  moment,
  season,
  copySerial = null,
  className = "",
}: {
  moment: LeagueMoment;
  season?: string | null;
  /** Which mint of the moment this copy is (1 = first pulled). Null on the
   *  public wall, where the moment itself is shown rather than a copy. */
  copySerial?: number | null;
  /** Sizing belongs to the caller — same aspect ratio as a player card, so
   *  matching the width matches the height too. */
  className?: string;
}) {
  const family = momentFamilyOf(moment.triggerKey);
  const splash = moment.champion ? championSplashUrl(moment.champion, 0) : null;
  const clock = gameClock(moment.durationMin);

  return (
    <article
      aria-label={`${moment.title} — ${moment.summonerName}`}
      className={`sig-moment relative flex aspect-[5/7] w-full flex-col overflow-hidden rounded-xl ${className}`}
    >
      {/* Family backdrop first, splash over it: the family still tints the
          edges through the scrim, and a champion with no splash art keeps a
          finished card instead of a hole. */}
      <span className={`${FAMILY_ART[family]} absolute inset-0`} />
      {splash ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={splash}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-top opacity-85"
          loading="lazy"
          decoding="async"
        />
      ) : null}
      <span className="sig-art-beam" />
      <span className="sig-scrim" />

      <div className="relative z-10 flex h-full flex-col px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <span className="font-display text-[0.6rem] font-bold uppercase tracking-[0.22em] text-white/75">
              {season ? `${season} ` : ""}Moment
            </span>
            <span className="font-mono text-[0.6rem] tracking-[0.1em] text-white/80">
              <span className="sig-rec">●</span> REC{clock ? ` · ${clock}` : ""}
            </span>
          </div>
          <span className="sig-chip rounded font-mono text-[0.56rem] tracking-[0.1em]" style={{ padding: "3px 7px" }}>
            № {moment.id}
            {copySerial ? ` · ${mintOrdinal(copySerial)}` : ""}
          </span>
        </div>

        <div className={`sig-ribbon ${FAMILY_RIBBON[family]}`}>
          <span className="font-display text-[1.45rem] font-bold uppercase leading-none tracking-[0.05em]">
            {moment.title}
          </span>
        </div>

        <div className="mt-auto flex flex-col items-center gap-0.5 pb-1 text-center">
          <Link
            href={`/card/${moment.slug}`}
            className="font-display text-xl font-bold tracking-wide text-white underline-offset-4 hover:underline"
          >
            {moment.summonerName}
          </Link>
          <p className="font-mono text-[0.62rem] leading-snug tracking-[0.04em] text-white/75">{moment.headline}</p>
          <p className="font-display text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-white/50">
            {moment.opponent ? `vs ${moment.opponent} · ` : moment.teamName ? `${moment.teamName} · ` : ""}
            {weekLabel(moment.weekStart)}
          </p>
        </div>
      </div>
    </article>
  );
}

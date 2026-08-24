// Team-set progress: one row per roster, with a meter and the players still
// missing. Server-renderable — this is a read of the collection, not an
// interaction.

import Link from "next/link";
import { buildTeamSets, completedSetCount } from "@/lib/cards/sets";
import type { PlayerCardData } from "@/lib/cards/build";

export default function TeamSetsSection({
  cards,
  ownedSlugs,
}: {
  cards: PlayerCardData[];
  ownedSlugs: string[];
}) {
  const sets = buildTeamSets(cards, ownedSlugs);
  if (sets.length === 0) return null;
  const completed = completedSetCount(sets);

  return (
    <section aria-labelledby="team-sets-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 id="team-sets-heading" className="type-display text-2xl sm:text-3xl">
          Team sets
        </h2>
        <span className="text-xs uppercase tracking-[0.16em] text-steel">
          {completed} of {sets.length} complete
        </span>
      </div>
      <p className="max-w-2xl text-sm text-steel">
        Own every player on a roster to finish its set. Rosters move during the season, so a trade or a
        first-time sub can reopen one.
      </p>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sets.map((set) => {
          const missing = set.members.filter((member) => !member.owned);
          return (
            <article
              key={set.teamName}
              aria-label={`${set.teamName} set`}
              className={`card-brand flex h-full flex-col gap-3 p-5 ${set.complete ? "border-gold/70" : ""}`}
            >
              <div className="flex items-center gap-3">
                {set.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={set.imageUrl} alt="" className="h-10 w-10 shrink-0 object-contain" loading="lazy" decoding="async" />
                ) : null}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-display text-lg font-semibold text-white">{set.teamName}</h3>
                  <p className="text-xs uppercase tracking-[0.16em] text-steel">
                    {set.ownedCount}/{set.members.length} collected
                  </p>
                </div>
                {set.complete ? (
                  <span className="rounded-full border border-gold/60 bg-gold/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-gold">
                    Complete
                  </span>
                ) : null}
              </div>

              <div
                className="h-2 w-full overflow-hidden rounded-full bg-line/60"
                role="progressbar"
                aria-valuenow={set.ownedCount}
                aria-valuemin={0}
                aria-valuemax={set.members.length}
                aria-label={`${set.teamName} set progress`}
              >
                <div
                  className={`h-full rounded-full ${set.complete ? "bg-gold" : "bg-coral"}`}
                  style={{ width: `${Math.round((100 * set.ownedCount) / set.members.length)}%` }}
                />
              </div>

              {missing.length > 0 ? (
                <p className="text-xs leading-5 text-steel">
                  <span className="text-white">Still need:</span>{" "}
                  {missing.map((member, index) => (
                    <span key={member.slug}>
                      {index > 0 ? ", " : ""}
                      <Link href={`/card/${member.slug}`} className="underline-offset-4 hover:text-coral hover:underline">
                        {member.name}
                      </Link>
                    </span>
                  ))}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

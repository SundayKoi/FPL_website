// The atlas (src/lib/expeditions/atlas.ts, spec §5): every place the
// collector's squads have reached this season, route by route, what each
// road pays when it is walked end to end, and the landmarks the league has
// named after whoever got somewhere first.
//
// Self-contained and prop-driven, so the board can mount it as the
// drawer's Atlas tab from the one `atlas` prop the page builds (atlasFor
// over fetchAtlasRuns, fetchLandmarks and fetchAtlasAwards). A null atlas —
// the history could not be read — renders nothing, which is how the tab
// stays hidden.
//
// Only types come from atlas.ts: that module reads the road to title the
// places seen, and none of it may reach the browser. A place the collector
// has not reached arrives as a count and renders as a `?`; a league
// landmark there says who and when, never where.
//
// Presentation only: a landmark is named, and a road paid, in their RPCs.

import type { Atlas, AtlasLandmarkView, AtlasPlace, AtlasRoad } from "@/lib/expeditions/atlas";

function dateOf(at: string): string {
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
}

function times(count: number): string {
  return count === 1 ? "once" : count === 2 ? "twice" : `${count} times`;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "You have seen 7 of the 9 places on the Legend Hunt." */
function seenLine(road: AtlasRoad): string {
  if (road.seen === 0) return `You haven't reached any of the ${road.size} places on ${road.name} yet.`;
  if (road.seen >= road.size) return `You have seen all ${road.size} places on ${road.name}.`;
  return `You have seen ${road.seen} of the ${road.size} places on ${road.name}.`;
}

/** What walking the road pays, and where the collector stands on it. */
function rewardLine(road: AtlasRoad): { text: string; paid: boolean } {
  if (road.awarded) {
    return { text: `Walked end to end this season — you were paid ${road.pays} on ${dateOf(road.awarded.at)}.`, paid: true };
  }
  if (road.counted >= road.size) {
    // The stamps cover the road but no award is on record yet: the claim
    // that completed it could not reach the award (it is best effort), and
    // the next claim on this route asks again.
    return { text: `Every place walked. The reward — ${road.pays} — is paid the next time a squad comes home from ${road.name}.`, paid: false };
  }
  return { text: `See all ${road.size} in one season and it pays ${road.pays}.`, paid: false };
}

function byLine(landmark: AtlasLandmarkView): string {
  return landmark.mine ? "first reached by you" : `first reached by ${landmark.by}`;
}

function Crest() {
  return (
    <span className="ml-1.5 rounded-full border border-gold/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-gold">
      ★ crest
    </span>
  );
}

function PlaceRow({ place }: { place: AtlasPlace }) {
  return (
    <li data-testid={`atlas-place-${place.key}`} className="flex min-h-11 items-center gap-3 rounded-md border border-line bg-panel px-3 py-2">
      <span
        aria-hidden="true"
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
          place.landmark?.mine ? "border-gold bg-gold/15 text-gold" : "border-mint/60 bg-mint/10 text-mint"
        }`}
      >
        ✓
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold text-white">{place.title}</span>
        <span className="text-xs text-steel">
          Reached {times(place.times)} · first on {dateOf(place.firstAt)}
          {place.landmark ? (
            <>
              {" · "}
              <span className={place.landmark.mine ? "text-gold" : "text-white"}>{byLine(place.landmark)}</span>
              {place.landmark.crest ? <Crest /> : null}
            </>
          ) : null}
        </span>
      </span>
    </li>
  );
}

function RoadCard({ road }: { road: AtlasRoad }) {
  const unknown = Math.max(0, road.size - road.places.length);
  const reward = rewardLine(road);
  const pct = road.size > 0 ? Math.round((Math.min(road.seen, road.size) / road.size) * 100) : 0;
  const before = road.seen - road.counted;
  return (
    <details data-testid={`atlas-road-${road.tier}`} open={road.seen > 0} className="card-brand group">
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 marker:hidden">
        <span className="flex flex-col">
          <span className="type-display text-lg text-white">{road.label}</span>
          <span className="text-xs text-steel">
            {road.seen} of {road.size} places · pays {road.pays}
          </span>
        </span>
        {road.awarded ? (
          <span className="rounded-full border border-mint/50 bg-mint/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-mint">Walked</span>
        ) : (
          <span aria-hidden="true" className="text-xs text-steel group-open:rotate-180">
            ▾
          </span>
        )}
      </summary>

      <div className="flex flex-col gap-3 border-t border-line px-4 pb-4 pt-3">
        <p data-testid={`atlas-seen-${road.tier}`} className="text-sm font-semibold text-white">
          {seenLine(road)}
        </p>
        <div
          className="bar-track"
          role="progressbar"
          aria-label={`${road.label}: ${road.seen} of ${road.size} places seen`}
          aria-valuemin={0}
          aria-valuemax={road.size}
          aria-valuenow={Math.min(road.seen, road.size)}
        >
          <div className="bar-fill" style={{ width: `${pct}%`, background: reward.paid ? "var(--color-mint)" : "var(--color-gold)" }} />
        </div>
        <p data-testid={`atlas-reward-${road.tier}`} className={`text-sm ${reward.paid ? "text-mint" : "text-steel"}`}>
          {reward.text}
          {before > 0 && !road.awarded && road.counted < road.size ? (
            <>
              {" "}
              Only runs brought home since the atlas opened count toward it: {road.counted} of {road.size} so far.
            </>
          ) : null}
        </p>

        {road.places.length > 0 || unknown > 0 ? (
          <ul aria-label={`Places on ${road.name}`} className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {road.places.map((place) => (
              <PlaceRow key={place.key} place={place} />
            ))}
            {Array.from({ length: unknown }, (_, index) => (
              <li
                key={`unknown-${index}`}
                data-testid={`atlas-unknown-${road.tier}`}
                className="flex min-h-11 items-center gap-3 rounded-md border border-dashed border-line px-3 py-2"
              >
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line text-xs font-bold text-steel">
                  ?
                </span>
                <span className="text-xs text-steel">A place you haven&apos;t reached</span>
              </li>
            ))}
          </ul>
        ) : null}

        {road.unseenLandmarks.length > 0 ? (
          <p data-testid={`atlas-unseen-landmarks-${road.tier}`} className="text-xs text-steel">
            {plural(road.unseenLandmarks.length, "place")} you haven&apos;t reached {road.unseenLandmarks.length === 1 ? "has" : "have"} been named already:{" "}
            {road.unseenLandmarks.map((landmark, index) => (
              <span key={`${landmark.by}-${landmark.at}-${index}`}>
                {index > 0 ? ", " : ""}
                {/* The crest pill beside the name it belongs to, so the
                    sentence still ends on its date and its full stop. */}
                <span className="text-white">{byLine(landmark)}</span>
                {landmark.crest ? <Crest /> : null} on {dateOf(landmark.at)}
              </span>
            ))}
            .
          </p>
        ) : null}

        {road.meetings.length > 0 ? (
          <p data-testid={`atlas-met-${road.tier}`} className="text-xs text-steel">
            <span className="font-semibold text-white">Met on the road:</span>{" "}
            {road.meetings.map((meeting) => `${meeting.words.toLowerCase()} ${meeting.times > 1 ? `(${times(meeting.times)})` : ""}`.trim()).join(" · ")}
          </p>
        ) : null}

        {road.ghosts.length > 0 ? (
          <p data-testid={`atlas-ghosts-${road.tier}`} className="text-xs text-steel">
            <span className="font-semibold text-white">Ghosts met:</span>{" "}
            {road.ghosts.map((ghost) => `${ghost.name} (${ghost.owner}'s card, ${dateOf(ghost.at)})`).join(" · ")}
          </p>
        ) : null}
      </div>
    </details>
  );
}

export default function AtlasPanel({ atlas }: { atlas: Atlas | null }) {
  if (!atlas) return null;
  return (
    <section aria-label="Atlas" data-testid="atlas" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="label-dash">Every place your squads have been</span>
        <h2 className="type-display text-2xl sm:text-3xl">Atlas</h2>
        <p className="text-sm text-steel">
          Every place your squads reach this season is marked here, route by route. See every place on a route in one season and
          it pays out. The first collector in the league to reach a place has it named after them for the season.
        </p>
      </div>

      {atlas.runs === 0 ? (
        <p data-testid="atlas-empty" className="card-brand px-4 py-3 text-sm text-steel">
          Nothing in the atlas yet. Bring a squad home and every place it walked is marked here — and if nobody in the league has
          reached one of them this season, it is named after you.
        </p>
      ) : null}

      {atlas.named.length > 0 ? (
        <div data-testid="atlas-named" className="flex flex-col gap-1.5">
          <span className="label-dash">Named after you</span>
          <ul className="flex flex-wrap gap-2 text-xs">
            {atlas.named.map((entry) => (
              <li key={entry.key} className="rounded-md border border-gold/40 bg-gold/5 px-3 py-1.5">
                <span className="font-semibold text-gold">{entry.title}</span>{" "}
                <span className="text-steel">· first reached {dateOf(entry.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {atlas.roads.map((road) => (
          <RoadCard key={road.tier} road={road} />
        ))}
      </div>
    </section>
  );
}

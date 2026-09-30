import { rewardWords } from "@/lib/expeditions/atlasWords";
import { CAMP_LINES } from "@/lib/expeditions/camp";
import { EXPEDITION_TIERS, ROAD_REWARDS, TIER_ORDER } from "@/lib/expeditions/config";
// forks.ts, not routes.ts: this renders inside the board, a client
// component (see ExpeditionRules.tsx).
import { ROAD_SIZES } from "@/lib/expeditions/forks";

export default function AtlasRules() {
  const roads = TIER_ORDER.filter((tier) => ROAD_SIZES[tier] > 0);
  const plaque = CAMP_LINES.wall[CAMP_LINES.wall.length - 1];
  return (
    <div data-testid="rule-atlas" className="flex flex-col gap-2 rounded-lg border border-line bg-panel/60 p-3 text-sm text-steel">
      <h3 className="type-display text-lg text-white">The atlas: every place your squads reach</h3>
      <p>
        The Atlas tab marks every place your squads reach, route by route, each season. Reach every place a route can stop at —
        across all your runs on it that season — and the road pays once, in map fragments, not dollars:
      </p>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {roads.map((tier) => (
          <li
            key={tier}
            data-testid={`rule-road-${tier}`}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-md border border-line bg-black/30 px-2.5 py-1.5"
          >
            <span className="text-sm font-semibold text-white">
              {EXPEDITION_TIERS[tier].label} <span className="text-xs font-normal text-steel">· {ROAD_SIZES[tier]} places</span>
            </span>
            <span className="text-xs text-mint">{rewardWords(ROAD_REWARDS[tier])}</span>
          </li>
        ))}
      </ul>
      <p data-testid="rule-atlas-named">
        <strong className="text-white">Places named after their first visitor.</strong> The first collector in the league to reach a
        place, counted when the squad is brought home, has it named after them for the season, on everyone&apos;s map and in
        everyone&apos;s atlas. With {plaque.title.toLowerCase()} on the trophy wall, their crest shows beside it.
      </p>
      <p className="text-xs">
        Only runs brought home since the atlas opened count toward a road. Premier and Academy keep separate atlases: half a road in
        each completes neither.
      </p>
    </div>
  );
}

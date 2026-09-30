import { EXPEDITION_TIERS, TIER_ORDER } from "@/lib/expeditions/config";
import { BOSS_HEALTH, LANDMARK_MILES, LEAGUE_GOAL_FRAGMENTS, unitCount } from "@/lib/expeditions/league";
import { MILES_BY_TIER } from "@/lib/expeditions/trail";
import { fragmentsWord } from "./words";

export default function LeagueGoalRules() {
  // The shortest walk and the longest, off the miles table.
  const walks = TIER_ORDER.filter((tier) => MILES_BY_TIER[tier] > 0).sort((a, b) => MILES_BY_TIER[a] - MILES_BY_TIER[b]);
  const fewest = walks[0];
  const most = walks[walks.length - 1];
  return (
    <div data-testid="rule-league" className="flex flex-col gap-2 rounded-lg border border-mint/40 bg-mint/5 p-3 text-sm text-steel">
      <h3 className="type-display text-lg text-white">The league&apos;s expedition of the week</h3>
      <p>
        Every week the whole league shares one goal, and every run anyone brings home moves it along. A run counts for the week it
        set out in, once you bring the squad home. The weeks take turns, each named after one of that week&apos;s matches:
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        <li data-testid="rule-league-landmark" className="flex flex-col gap-1 rounded-md border border-line bg-black/30 p-2.5">
          <span className="text-sm font-semibold text-white">
            A place to walk to <span className="font-normal text-steel">(a landmark)</span>
          </span>
          <span className="font-mono text-xs text-gold">{unitCount(LANDMARK_MILES, "miles")} away</span>
          <span className="text-xs">
            Every run brought home walks its route&apos;s miles toward it: {EXPEDITION_TIERS[fewest].label} {MILES_BY_TIER[fewest]},{" "}
            {EXPEDITION_TIERS[most].label} {MILES_BY_TIER[most]}.
          </span>
        </li>
        <li data-testid="rule-league-boss" className="flex flex-col gap-1 rounded-md border border-line bg-black/30 p-2.5">
          <span className="text-sm font-semibold text-white">
            A monster to wear down <span className="font-normal text-steel">(a boss)</span>
          </span>
          <span className="font-mono text-xs text-gold">{BOSS_HEALTH} health</span>
          <span className="text-xs">Every fork where a squad goes for it (a push), anywhere in the league, takes one off.</span>
        </li>
      </ul>
      <p data-testid="rule-league-reward">
        When the league gets there, everyone who helped — one mile or one push is enough — gets{" "}
        <strong className="text-white">{fragmentsWord(LEAGUE_GOAL_FRAGMENTS)}</strong>, and whoever did the most is named{" "}
        <strong className="text-white">Vanguard</strong> for the week. Map fragments, not dollars.
      </p>
      <p className="text-xs">
        A goal the league has not reached stays open through the next week, for squads that set out in its week and come home late;
        then it closes. Premier and Academy each walk their own.
      </p>
    </div>
  );
}

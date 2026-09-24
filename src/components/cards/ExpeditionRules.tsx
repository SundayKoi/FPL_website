// The rules of the road: every way an expedition can pay a card and every
// way it can cost one, on the page where the choice is made.
//
// Hook-free and server-renderable. Every number is imported from the
// config that enforces it (the packs/config → perks.ts discipline), so the
// page cannot promise a three-day bench while the RPC writes four. The
// same goes for the edges, the camp, the league goal, the road ahead and
// the atlas: their tables are rendered from archetypes.ts, camp.ts,
// league.ts, reveal.ts and config.ts/forks.ts, never restated.

import type { ReactNode } from "react";
import { fmtPoints } from "@/lib/betting/format";
import { FALLBACK_ARCHETYPE } from "@/lib/cards/build";
import { MUTATIONS } from "@/lib/cards/mutations";
import { ABILITY_KIND_LABELS, ARCHETYPE_ABILITIES, type AbilityKind } from "@/lib/expeditions/archetypes";
import { rewardWords } from "@/lib/expeditions/atlasWords";
import { CAMP_LINES, CAMP_PRICES, CAMP_UPGRADES, POLICY_LINE, priceLine, type CampPrice } from "@/lib/expeditions/camp";
import {
  ECHO_CHANCE,
  EXPEDITION_TIERS,
  INSURANCE_FEE,
  INSURANCE_PER_WEEK,
  PATRON_INSURANCE_PER_WEEK,
  MERCHANT_DOLLARS,
  MYTHIC_NEEDS,
  ROAD_REWARDS,
  SURGE_BONUS,
  LOST_DAYS,
  RANSOM_BASE,
  RANSOM_PER_SHINE,
  TIER_ORDER,
  WOUNDED_HOURS,
  payoutRange,
  type ExpeditionTierDef,
  type RouteRisk,
} from "@/lib/expeditions/config";
import { BOSS_HEALTH, LANDMARK_MILES, LEAGUE_GOAL_FRAGMENTS, unitCount } from "@/lib/expeditions/league";
import { REVEAL_FRAGMENTS, TRAIL_SIGHT, type RevealedBy } from "@/lib/expeditions/reveal";
import ExpeditionIcon from "./expeditionIcons";
// forks.ts, not routes.ts or journal.ts: this renders inside the board, a
// client component, and those two modules hold every road there is. The
// numbers quoted here live in forks.ts for exactly that reason.
import {
  CACHE_LOOT,
  CURSED_AGAIN_LOST,
  SCOUTED_CAMP_RISK,
  VETERAN_HOLD_LOOT,
  DEAD_NEEDS_PUSHES,
  FRAGMENT_CHANCE,
  GHOST_HAUNT,
  MOMENTUM_BONUS,
  MOMENTUM_DEATH,
  GHOST_HAUNT_FLOOR,
  HOLD_LOOT,
  HUNTER_FRAGMENT_CHANCE,
  MUTATION_SOURCES,
  RIVAL_LOSS_LOOT,
  RIVAL_WIN_LOOT,
  ROAD_ENCOUNTER_CHANCE,
  ROAD_SIZES,
  ROLE_CALLS,
  SHRINE_RISK,
  STORM_HOURS,
  STRANDED_BOUNTY,
  TOLL_LOOT,
} from "@/lib/expeditions/forks";
import { MILES_BY_TIER, TRAIL_TITLES, WAYFARER_SHINE } from "@/lib/expeditions/trail";
import { WEATHERS } from "@/lib/expeditions/weather";
import { ACCOLADES, ACCOLADE_ORDER } from "@/lib/expeditions/standings";
import { CAMPAIGNS, CAMPAIGN_ORDER } from "@/lib/expeditions/campaigns";

export const RISK_LABEL: Record<RouteRisk, string> = {
  none: "Nothing can be hurt",
  wounded: "Cards can be wounded",
  lost: "Cards can be lost",
  dead: "Cards can DIE",
};

export const RISK_CLASS: Record<RouteRisk, string> = {
  none: "border-mint/50 text-mint",
  wounded: "border-gold/60 text-gold",
  lost: "border-coral/70 text-coral",
  dead: "border-red-500/80 bg-red-500/10 text-red-300",
};

/** One gate a tier applies. `power` is set on the squad-total gate alone,
 *  so a reader that says "power" (the board) can print its own word there
 *  while the rulebook keeps "shine". */
export interface RequirementPart {
  text: string;
  power?: number;
}

/** The gates a tier actually applies, in the order the line prints them. */
export function requirementParts(def: ExpeditionTierDef): RequirementPart[] {
  const parts: RequirementPart[] = [];
  if (def.patron) parts.push({ text: "patrons only" });
  if (def.minShine > 0) parts.push({ text: `${def.minShine} shine`, power: def.minShine });
  if (def.minFoils > 0) parts.push({ text: `${def.minFoils} foil${def.minFoils === 1 ? "" : "s"}` });
  if (def.minSigned > 0) parts.push({ text: `${def.minSigned} signed` });
  if (def.fragments > 0) parts.push({ text: `${def.fragments} map fragments` });
  if (def.key === "mythic") parts.push(...MYTHIC_NEEDS.map((text) => ({ text })));
  if (def.fee > 0) parts.push({ text: `${fmtPoints(def.fee)} fee` });
  return parts;
}

/** What a tier asks for when it asks for nothing. */
export const NO_REQUIREMENTS = "Anyone can run it";

/** "12 shine · 1 foil" — the gates a tier actually applies, in the rules' words. */
export function requirementLine(def: ExpeditionTierDef): string {
  const parts = requirementParts(def);
  return parts.length === 0 ? NO_REQUIREMENTS : parts.map((part) => part.text).join(" · ");
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** How many distinct places a route can stop at, across its checkpoints
 *  — the number that says "no two runs walk the same road". A count, read
 *  from ROAD_SIZES (held equal to ROADS by routes.test.ts). */
function placesOn(tier: keyof typeof ROAD_SIZES): number {
  return ROAD_SIZES[tier];
}

/** Where a mutation can come from on the road, read off MUTATION_SOURCES
 *  (held equal to ROADS by routes.test.ts) so the sentence cannot drift
 *  from the odds. */
function mutationSources(): string {
  return MUTATION_SOURCES.map(
    (source) =>
      `${source.mutation} by ${source.by === "push" ? "pushing" : "camping at"} ${source.place.toLowerCase()} (${EXPEDITION_TIERS[source.tier].label}, ${pct(source.chance)})`,
  ).join("; ");
}

// === the next level: edges, the road ahead, the camp, the league, the atlas ===
// Plain words first, the game's word second. The board says "power" where
// the rest of this rulebook says "shine", and "landmark" is the league
// goal's word, so a place named after whoever reached it first is said as
// exactly that.

/** "one map fragment", "2 map fragments". */
function fragmentsWord(n: number): string {
  return `${n === 1 ? "one" : n} map fragment${n === 1 ? "" : "s"}`;
}

/** The edge table as the rules print it: one group per kind, in
 *  ABILITY_KIND_LABELS' order, the strongest first inside each — the one
 *  that counts when two of a kind meet. */
const EDGE_GROUPS = (Object.keys(ABILITY_KIND_LABELS) as AbilityKind[])
  .map((kind) => ({
    kind,
    label: ABILITY_KIND_LABELS[kind],
    edges: Object.values(ARCHETYPE_ABILITIES)
      .filter((edge) => edge.kind === kind)
      .sort((a, b) => b.power - a.power),
  }))
  .filter((group) => group.edges.length > 0);

/** The strongest an edge comes: the scale its dots are drawn on. */
const EDGE_STRENGTH_MAX = Math.max(...Object.values(ARCHETYPE_ABILITIES).map((edge) => edge.power));

/** "Camp Thief" → "camp-thief": a row's test id. */
export function edgeSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** An edge's strength as dots, filled up to its strength and hollow past
 *  it, with the number for a screen reader. Shape carries it, not colour. */
function Strength({ power }: { power: number }) {
  return (
    <span className="shrink-0 font-mono text-xs tracking-[0.15em] text-gold">
      <span aria-hidden="true">
        {"●".repeat(power)}
        {"○".repeat(Math.max(0, EDGE_STRENGTH_MAX - power))}
      </span>
      <span className="sr-only">
        strength {power} of {EDGE_STRENGTH_MAX}
      </span>
    </span>
  );
}

function EdgeRules({ id }: { id: string }) {
  return (
    <div
      id={`${id}-edges`}
      data-testid="rule-edges"
      className="flex flex-col gap-3 rounded-lg border border-gold/40 bg-gold/5 p-3 text-sm text-steel"
    >
      <h3 className="type-display flex items-center gap-2 text-lg text-white">
        <ExpeditionIcon name="edge" className="text-gold" />
        Edges: what a card&apos;s title does on the road
      </h3>
      <p>
        Every card carries a title from the day it was printed, and each title is an <strong className="text-white">edge</strong>:
        one small way that card bends a run — softer harm, more loot at camp, a clock that beats the storm. The squad picker shows
        each card&apos;s edge and whether it counts, a fork&apos;s choices say when an edge changes them, and the homecoming lists
        the edges that fired.
      </p>
      <p data-testid="rule-edges-stacking" className="rounded-md border border-gold/40 bg-black/30 px-3 py-2">
        <strong className="text-white">
          Only one edge of each kind counts in a squad: the strongest; a tie goes to the card with more trail miles.
        </strong>{" "}
        Three guards are one guard; a guard, a rival edge and a camp edge are three — so send three different kinds.
      </p>
      <p className="text-xs">Find your card&apos;s title below and open its kind to read what it does. The dots are its strength.</p>
      <ul className="grid items-start gap-1.5 sm:grid-cols-2">
        {EDGE_GROUPS.map((group) => (
          <li key={group.kind}>
            <details data-testid={`rule-edges-${group.kind}`} className="group rounded-md border border-line bg-black/30">
              <summary className="flex min-h-11 cursor-pointer list-none items-start gap-2 px-3 py-2 marker:hidden">
                <ExpeditionIcon name="chevron" className="mt-1 text-steel transition group-open:rotate-90" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-semibold text-white">
                    {group.label}{" "}
                    <span className="text-xs font-normal text-steel">
                      · {group.edges.length} {group.edges.length === 1 ? "title" : "titles"}
                    </span>
                  </span>
                  {/* A title never breaks across a line: "The / Assassin" reads as two. */}
                  <span className="text-xs text-steel group-open:hidden">
                    {group.edges.map((edge, index) => (
                      <span key={edge.title}>
                        <span className="whitespace-nowrap">
                          {edge.title}
                          {index < group.edges.length - 1 ? " ·" : ""}
                        </span>{" "}
                      </span>
                    ))}
                  </span>
                </span>
              </summary>
              <ul className="flex flex-col border-t border-line/60">
                {group.edges.map((edge) => (
                  <li
                    key={edge.title}
                    data-testid={`rule-edge-${edgeSlug(edge.title)}`}
                    className="flex flex-col gap-0.5 border-b border-line/40 px-3 py-2 last:border-b-0"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold text-white">{edge.title}</span>
                      <Strength power={edge.power} />
                    </span>
                    <span className="text-xs">{edge.does}</span>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
      <p className="text-xs">
        A title this list does not know counts as {FALLBACK_ARCHETYPE}. A card that dies on the road takes its edge with it from
        that moment, and the edge of the same kind it outranked does not step in. A squad already on the road when a rule changes
        keeps the rules it left with.
      </p>
    </div>
  );
}

/** "the next checkpoint", "the next two checkpoints", "the whole road". */
function sightWords(n: number): string {
  if (!Number.isFinite(n)) return "the whole road";
  if (n === 1) return "the next checkpoint";
  return `the next ${n === 2 ? "two" : n === 3 ? "three" : n} checkpoints`;
}

/** The edges that see down the road: every title of the sight kind. */
const SIGHT_EDGES = Object.values(ARCHETYPE_ABILITIES).filter((edge) => edge.kind === "reveal");

/**
 * Every way a checkpoint ahead becomes known (reveal.ts), in the order a
 * player meets them. Keyed on RevealedBy, so a new way to know a place
 * does not build until it is said here too.
 */
export const REVEAL_WAYS: Readonly<Record<RevealedBy, { title: string; says: ReactNode }>> = {
  walked: {
    title: "Getting there",
    says: "A checkpoint is known once its fork opens, and the whole road once the squad is home.",
  },
  scout: {
    title: "A scout",
    says: "Answer a fork with the Jungle's scout and the squad knows the checkpoint after it.",
  },
  trail: {
    title: "Trail titles",
    says: `${TRAIL_TITLES.map((title, index) => `${index === 0 ? "A" : "a"} ${title.label}${index === 0 ? " card knows" : ","} ${sightWords(TRAIL_SIGHT[title.key])}`).join("; ")}. The best in the squad counts, and the sight moves on as each fork opens.`,
  },
  edge: {
    title: "Sight edges",
    says: (
      <>
        {SIGHT_EDGES.map((edge, index) => (
          <span key={edge.title}>
            {index > 0 ? " " : ""}
            <strong className="text-white">{edge.title}.</strong> {edge.does}
          </span>
        ))}
      </>
    ),
  },
  fragment: {
    title: "A map fragment",
    says: `Spend ${fragmentsWord(REVEAL_FRAGMENTS)} on a squad in the field (See the road ahead, in the corner of its map) and it knows every checkpoint it has left. Once per road.`,
  },
  convoy: {
    title: "A convoy partner",
    says: "Two squads in a convoy walk one road, so when either of you pays to see it, you both do, and nobody pays twice.",
  },
  campaign: {
    title: "A campaign",
    says: "A campaign stage's road is handed down from the stage before it, so the squad sets out with the map.",
  },
};

function RoadAheadRules() {
  return (
    <div data-testid="rule-road-ahead" className="flex flex-col gap-2 rounded-lg border border-line bg-panel/60 p-3 text-sm text-steel">
      <h3 className="type-display text-lg text-white">The road ahead: what the squad can see</h3>
      <p>
        A squad sees only what it knows. A checkpoint it has not seen yet shows on its map as a{" "}
        <span
          aria-hidden="true"
          className="inline-grid h-5 w-5 place-content-center rounded-full border border-dashed border-steel align-[-4px] text-[11px] font-bold leading-none"
        >
          ?
        </span>
        <span className="sr-only">question mark</span>; if the squad has a bad feeling about the place, a dread mark{" "}
        <ExpeditionIcon name="risk" className="inline align-[-2px] text-coral" /> sits over it (the fork is warned). That is all an
        unseen checkpoint gives away: its name is not sent to your browser until the squad knows it, so nobody can peek.
      </p>
      <p>What shows more:</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(REVEAL_WAYS) as RevealedBy[]).map((by) => (
          <li key={by} data-testid={`rule-reveal-${by}`} className="flex flex-col gap-1 rounded-md border border-line bg-black/30 p-2.5">
            <span className="text-sm font-semibold text-white">{REVEAL_WAYS[by].title}</span>
            <span className="text-xs">{REVEAL_WAYS[by].says}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs">
        Knowing a place changes nothing about it: the odds are the same seen or unseen, and every fork prints its own when it opens.
      </p>
    </div>
  );
}

/** A camp level's game word, when it is not just its plain one: "squad
 *  slot" beside "A second scouting squad", nothing beside "A tent". */
function alsoCalled(title: string, term: string): string | null {
  const plain = title.toLowerCase().replace(/^(a|an|the)\s+/, "");
  return plain === term.toLowerCase() ? null : term.toLowerCase();
}

/** Every level of every upgrade, bought: what the whole camp costs. */
const CAMP_TOTAL: CampPrice = CAMP_UPGRADES.flatMap((upgrade) => CAMP_PRICES[upgrade]).reduce(
  (sum, price) => ({ dollars: sum.dollars + price.dollars, fragments: sum.fragments + price.fragments }),
  { dollars: 0, fragments: 0 },
);

function BaseCampRules() {
  const policyTerm = alsoCalled(POLICY_LINE.title, POLICY_LINE.term);
  return (
    <div data-testid="rule-base-camp" className="flex flex-col gap-2 rounded-lg border border-line bg-panel/60 p-3 text-sm text-steel">
      <h3 className="type-display text-lg text-white">Base camp: what you build between runs</h3>
      <p>
        Your camp is yours for good: every season, in both leagues. Build it a level at a time on the Camp tab, with dollars and
        sometimes map fragments. Every level of everything comes to{" "}
        <strong data-testid="rule-camp-total" className="text-white">
          {priceLine(CAMP_TOTAL)}
        </strong>
        .
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {CAMP_UPGRADES.map((upgrade) => {
          const first = CAMP_LINES[upgrade][0];
          const term = alsoCalled(first.title, first.term);
          const levels = CAMP_PRICES[upgrade];
          return (
            <li key={upgrade} data-testid={`rule-camp-${upgrade}`} className="flex flex-col gap-1.5 rounded-md border border-line bg-black/30 p-2.5">
              <span className="text-sm font-semibold text-white">
                {first.title}
                {term ? <span className="font-normal text-steel"> ({term})</span> : null}
              </span>
              <ol className="flex flex-col gap-1.5">
                {levels.map((price, index) => {
                  const line = CAMP_LINES[upgrade][index] ?? first;
                  return (
                    <li key={index} data-testid={`rule-camp-${upgrade}-${index + 1}`} className="flex flex-col gap-0.5 text-xs">
                      <span className="font-semibold text-gold">
                        {levels.length > 1 ? `Level ${index + 1}${index > 0 ? ` · ${line.title}` : ""} · ` : ""}
                        {priceLine(price)}
                      </span>
                      <span>{line.does}</span>
                    </li>
                  );
                })}
              </ol>
            </li>
          );
        })}
        <li data-testid="rule-camp-policy" className="flex flex-col gap-1.5 rounded-md border border-line bg-black/30 p-2.5">
          <span className="text-sm font-semibold text-white">
            {POLICY_LINE.title}
            {policyTerm ? <span className="font-normal text-steel"> ({policyTerm})</span> : null}
          </span>
          <span className="flex flex-col gap-0.5 text-xs">
            <span className="font-semibold text-gold">
              {priceLine(CAMP_PRICES.policy[0])} · needs {CAMP_LINES.forge[0].title.toLowerCase()}
            </span>
            <span>{POLICY_LINE.does}</span>
          </span>
        </li>
      </ul>
    </div>
  );
}

function LeagueGoalRules() {
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

function AtlasRules() {
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

export default function ExpeditionRules({ id = "expedition-rules" }: { id?: string }) {
  const woundedDays = WOUNDED_HOURS / 24;
  const raidPlaces = placesOn("raid");
  const legendaryPlaces = placesOn("legendary");
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      data-testid="expedition-rules"
      className="card-brand flex flex-col gap-6 border-gold/40 p-5 sm:p-6"
    >
      <div>
        <span className="label-dash text-gold">Read before you send anyone</span>
        <h2 id={`${id}-title`} className="type-display mt-1 text-2xl sm:text-3xl">
          The rules of the road
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-steel">
          A run is a route with checkpoints. At each one the squad stops and asks you what to do, and what you
          say decides what they bring back and whether they all come back. Nothing here is hidden: the ladder
          below says what every run risks, every fork says what it risks before you answer, and the launch
          button names the cards that can be hurt.
        </p>
      </div>

      {/* ── The ladder ─────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <caption className="sr-only">Every run: how long, how many forks, what it takes, what it pays, what it risks</caption>
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.14em] text-steel">
              <th className="py-2 pr-3 font-semibold">Run</th>
              <th className="py-2 pr-3 font-semibold">Away</th>
              <th className="py-2 pr-3 font-semibold">Forks</th>
              <th className="py-2 pr-3 font-semibold">Entry</th>
              <th className="py-2 pr-3 font-semibold">Pays</th>
              <th className="py-2 font-semibold">Worst case</th>
            </tr>
          </thead>
          <tbody>
            {TIER_ORDER.map((key) => {
              const def = EXPEDITION_TIERS[key];
              const range = payoutRange(key);
              return (
                <tr key={key} className="border-t border-line/70 align-top">
                  <td className="py-2 pr-3 font-semibold text-white">{def.label}</td>
                  <td className="py-2 pr-3 font-mono text-steel">{def.durationHours}h</td>
                  <td className="py-2 pr-3 font-mono text-steel">{def.forks}</td>
                  <td className="py-2 pr-3 text-steel">{requirementLine(def)}</td>
                  <td className="py-2 pr-3 font-mono text-mint">
                    {range.max === 0 ? "nothing" : `${fmtPoints(range.min)}–${fmtPoints(range.max)}`}
                  </td>
                  <td className="py-2">
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${RISK_CLASS[def.risk]}`}>
                      {RISK_LABEL[def.risk]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── The patrons' road ─────────────────────────────────────── */}
      <div
        data-testid="rule-gilded"
        className="flex flex-col gap-1 rounded-lg border border-gold/50 bg-gold/10 p-3 text-sm text-steel"
      >
        <h4 className="text-sm font-bold text-gold">The Gilded Road — patrons only</h4>
        <p>
          A route of its own for patrons: {EXPEDITION_TIERS.gilded.durationHours / 24} days, {EXPEDITION_TIERS.gilded.forks} forks, and{" "}
          <strong className="text-white">{EXPEDITION_TIERS.gilded.minSigned} signed cards</strong> in the squad to set out — the hardest
          gate on the board, and the biggest bag: {fmtPoints(payoutRange("gilded").min)}–{fmtPoints(payoutRange("gilded").max)} on the
          base rate, before shine, the brief and the forks. Worst case wounded; nothing on it can lose a card. The forks, the
          odds and the payouts of every other run are exactly what they are for everyone.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* ── Forks ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 text-sm text-steel">
          <h3 className="type-display text-lg text-white">How a fork works</h3>
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>
              The run pauses at evenly spaced checkpoints. A {EXPEDITION_TIERS.raid.durationHours}h Deep Raid stops at 8h
              and 16h; each fork waits for an answer until the next checkpoint, then the run moves on.
            </li>
            <li>
              <strong className="text-white">The road is drawn when you launch.</strong> Each checkpoint is one of several places
              — a Deep Raid can stop at {raidPlaces} of them across its two forks, the Legendary route at {legendaryPlaces} across its
              four — so two runs on the same route rarely walk the same road. The places at one checkpoint carry the same
              odds as each other; what changes is what is there and what pushing means.
            </li>
            <li>
              <strong className="text-white">Silence is safe.</strong> If you do not answer, the squad camps. Nobody
              loses a card because they were asleep. You get a ping in Discord and a badge on the Play tab when a
              fork opens.
            </li>
            <li>
              <strong className="text-white">Push</strong> adds to the loot and rolls a harm on one card. <strong className="text-white">Camp</strong> keeps what you have.
              Every fork prints its own odds on the button before you press it.
            </li>
            <li>
              A push can turn up more than loot: some forks carry a chance of a <strong className="text-white">map fragment</strong> or a{" "}
              <strong className="text-white">free pack</strong> in the haul. And the careful way is not always the free way — a{" "}
              <strong className="text-white">toll</strong> fork can cost {pct(TOLL_LOOT)} of the loot for camping, and one checkpoint
              rewards a night held with a mutation. The button says which.
            </li>
            <li>
              <strong className="text-white">A run remembers itself.</strong> A toll paid at one fork is good for the next gate too. A
              Jungle&apos;s scout at one fork means the squad knows where not to sleep at the next: its camp risks are rolled at{" "}
              {pct(SCOUTED_CAMP_RISK)} of their odds, and the journal names the place ahead hours before the squad reaches it.
            </li>
            <li>
              Your cards unlock more: a <strong className="text-white">signed card</strong> can call in a favour (push with no
              risk, once a run), a <strong className="text-white">foil</strong> can light a dark fork (push at half the risk), and{" "}
              <strong className="text-white">three from one roster</strong> can rally (double the loot, 50% more risk).
            </li>
            <li>
              Some forks are <strong className="text-white">warned</strong>: the squad tells you not to. Push anyway and have it go
              wrong, and the card comes home Cursed.
            </li>
          </ul>
        </div>

        {/* ── Harm ──────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 text-sm text-steel">
          <h3 className="type-display text-lg text-white">How a card gets hurt</h3>
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>
              <strong className="text-gold">Wounded.</strong> The card comes home but sits out expeditions for{" "}
              {woundedDays} days. The lightest harm, and the only one a Deep Raid or the Gilded Road can do.
            </li>
            <li>
              <strong className="text-coral">Lost.</strong> The card does not come home. It stays in your collection, locked,
              for {LOST_DAYS} days: mount a <strong className="text-white">Rescue</strong> with another squad, or pay a{" "}
              <strong className="text-white">ransom</strong> ({fmtPoints(RANSOM_BASE)} plus {RANSOM_PER_SHINE} per point of the card&apos;s
              shine). Do neither and it is gone for good. Only a Legend Hunt, a Rescue, the Legendary route or the Mythic route can lose a card.
            </li>
            <li>
              <strong className="text-red-300">Dead.</strong> Only on the Legendary and Mythic routes, and only once the squad has pushed{" "}
              {DEAD_NEEDS_PUSHES} forks. There is no rescue from dead. The card goes to the graveyard on this page.
            </li>
            <li>
              A <strong className="text-white">one-roster</strong> Legend Hunt squad that is ignored at two forks is lost as one:
              the chemistry that helps you is the same thing that sinks you.
            </li>
            <li>
              A <strong className="text-white">Cursed</strong> card sent out again on a route that can lose it has a {pct(CURSED_AGAIN_LOST)} chance of
              not coming back.
            </li>
            <li>
              <strong className="text-white">Insurance</strong> ({fmtPoints(INSURANCE_FEE)} at launch) turns lost into wounded and dead
              into lost. {INSURANCE_PER_WEEK} policy a week; patrons get {PATRON_INSURANCE_PER_WEEK}, the first of them free.
            </li>
            <li>
              <strong className="text-white">Never at risk:</strong> an Eclipse, a moment, a champions relic or a team plate cannot board a
              route where it could be lost. The launch refuses them.
            </li>
          </ul>
        </div>
      </div>

      {/* ── The weather ──────────────────────────────────────────── */}
      <div data-testid="rule-weather" className="flex flex-col gap-2 rounded-lg border border-line bg-panel/60 p-3 text-sm text-steel">
        <h3 className="type-display text-lg text-white">The weather — one condition a week, league-wide</h3>
        <p>
          Every Eastern Monday the road gets its weather, posted with the brief here and in the Monday drop. It changes which
          squad is right to send this week without touching a single odds table, and{" "}
          <strong className="text-white">a run keeps the weather it launched under</strong>.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {Object.values(WEATHERS).map((sky) => (
            <li key={sky.key} data-testid={`rule-weather-${sky.key}`} className="flex flex-col gap-1 rounded-md border border-line bg-black/30 p-2.5">
              <span className="text-sm font-semibold text-white">
                <span aria-hidden>{sky.glyph} </span>
                {sky.label}
              </span>
              <span className="text-xs">{sky.does.join(" ")}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ── The Mythic route ─────────────────────────────────────── */}
      <div data-testid="rule-mythic" className="flex flex-col gap-2 rounded-lg border border-purple-300/40 bg-purple-500/5 p-3 text-sm text-steel">
        <h3 className="type-display text-lg text-white">The Mythic route — past the rift</h3>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>
            <strong className="text-white">The gates.</strong> {EXPEDITION_TIERS.mythic.minShine} shine, {EXPEDITION_TIERS.mythic.minFoils} foils, {EXPEDITION_TIERS.mythic.minSigned} signed,{" "}
            {EXPEDITION_TIERS.mythic.fragments} map fragments — and {MYTHIC_NEEDS[0]} in the squad, and {MYTHIC_NEEDS[1]} on your shelf. A route for a squad
            that has already survived the Legendary route once.
          </li>
          <li>
            <strong className="text-white">Five forks, every one warned</strong>, every one dark, and none with a safe camp: the careful way haunts.{" "}
            {EXPEDITION_TIERS.mythic.durationHours / 24} days out.
          </li>
          <li>
            <strong className="text-white">Momentum.</strong> The only route where the pushes carry: each consecutive push raises the next push&apos;s bonus by{" "}
            {pct(MOMENTUM_BONUS)} and its death roll by {pct(MOMENTUM_DEATH)}. A camp or a hold lets it go.
          </li>
          <li>
            <strong className="text-white">Voidborn.</strong> A Voidtouched card that comes home comes home Voidborn — the second stage, the one mutation that
            replaces another, with its own look: the expedition&apos;s frame, printed for good. The rest of the survivors come home Voidtouched.
          </li>
        </ul>
      </div>

      {/* ── Campaigns ────────────────────────────────────────────── */}
      <div data-testid="rule-campaigns" className="flex flex-col gap-2 rounded-lg border border-line bg-panel/60 p-3 text-sm text-steel">
        <h3 className="type-display text-lg text-white">Campaigns — three runs that tell one story</h3>
        <p>
          Open one from the board and walk its three stages in order, one open campaign at a time. Each stage&apos;s grade and
          pushes set the <strong className="text-white">next stage&apos;s road</strong>: the places at its checkpoints are handed
          down instead of drawn, so a poor scout opens the raid in the flooded works and a jackpot hunt goes into the Legendary
          route by the gallery of doors. A stage is walked alone (no convoy), and a stage&apos;s run keeps every other rule.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {CAMPAIGN_ORDER.map((key) => (
            <li key={key} data-testid={`rule-campaign-${key}`} className="flex flex-col gap-1 rounded-md border border-line bg-black/30 p-2.5">
              <span className="text-sm font-semibold" style={{ color: CAMPAIGNS[key].accent }}>
                {CAMPAIGNS[key].label}
              </span>
              <span className="text-xs text-white">{CAMPAIGNS[key].stages.map((tier) => EXPEDITION_TIERS[tier].label).join(" → ")}</span>
              <span className="text-xs">{CAMPAIGNS[key].blurb}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs">
          Finish all three and the finale prints a <strong className="text-white">campaign relic</strong>: a one-off copy of the
          survivor with the most miles, in the campaign&apos;s own frame. It is worth a relic&apos;s shine on an expedition and never boards
          a route that can lose it. Nobody home from the finale, no relic. Abandon a campaign and it is over; a run already out
          for it walks on.
        </p>
      </div>

      {/* ── Season standings ─────────────────────────────────────── */}
      <div data-testid="rule-standings" className="flex flex-col gap-2 rounded-lg border border-line bg-panel/60 p-3 text-sm text-steel">
        <h3 className="type-display text-lg text-white">Season standings — the roads, scored</h3>
        <p>
          Every claimed run counts: the miles the route is worth, the dollars it brought home, a Legendary route brought home
          whole, the rivals beaten to a spot. When staff close the season the top of each standing is marked, for good:
        </p>
        <ul className="grid gap-2 sm:grid-cols-3">
          {ACCOLADE_ORDER.map((kind) => (
            <li key={kind} data-testid={`rule-mark-${kind}`} className="flex flex-col gap-1 rounded-md border border-line bg-black/30 p-2.5">
              <span className="text-sm font-semibold" style={{ color: ACCOLADES[kind].accent }}>
                {ACCOLADES[kind].glyph} {ACCOLADES[kind].label}
              </span>
              <span className="text-xs">{ACCOLADES[kind].does}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs">Marks only. No dollars change hands at season close — the standings are a reason to go out, never a grind.</p>
      </div>

      {/* ── Company on the road ──────────────────────────────────── */}
      <div data-testid="rule-company" className="flex flex-col gap-2 rounded-lg border border-line bg-panel/60 p-3 text-sm text-steel">
        <h3 className="type-display text-lg text-white">Company on the road — the other people in it</h3>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>
            <strong className="text-white">A rival squad is a real one.</strong> When the trail puts another squad on your road, it is
            another collector&apos;s run on the same route — the one that launched closest before yours met it, within a day.
            The spot goes to the squad with <strong className="text-white">more shine</strong>; a tie is a coin. Win and the bag is{" "}
            {pct(RIVAL_WIN_LOOT)} heavier, lose and it is {pct(RIVAL_LOSS_LOOT)} lighter, and both journals say who. Nobody else
            on the road? Then the cairn where they would have stood holds a cache: {pct(CACHE_LOOT)} more.
          </li>
          <li>
            <strong className="text-white">The dead walk.</strong> A card that fell on the Legendary route haunts the Legend Hunt and
            the Legendary route for everyone, all season, by name. Camp at the next fork and the haunting is rolled at{" "}
            {GHOST_HAUNT}× the fork&apos;s odds and never under {pct(GHOST_HAUNT_FLOOR)}; push through and it cannot follow. Carry a card in
            the dead card&apos;s old team colours and the ghost stands aside — and leaves a cache: {pct(CACHE_LOOT)} more.
          </li>
          <li>
            <strong className="text-white">Rivalries</strong> are kept on this page for the season: who your squads have beaten to a
            spot, and who has beaten yours.
          </li>
        </ul>
      </div>

      {/* ── Role calls ───────────────────────────────────────────── */}
      <div data-testid="rule-roles" className="flex flex-col gap-2 rounded-lg border border-gold/40 bg-gold/5 p-3 text-sm text-steel">
        <h3 className="type-display text-lg text-white">The role calls — what each position can do at a fork</h3>
        <p>
          Beyond camp and push, every role the league prints has a call of its own, <strong className="text-white">once a run</strong>,
          shaped like the job that role does in the actual game. A squad with a Top, a Jungle and a Support has three of
          these to spend across its forks; a squad of three Mids has one. The button only appears when the role is there —
          the fork says which calls you are missing.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {ROLE_CALLS.map((call) => (
            <li key={call.choice} data-testid={`rule-call-${call.choice}`} className="flex flex-col gap-1 rounded-md border border-line bg-panel/60 p-2.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">{call.role}</span>
              <span className="text-sm font-semibold text-white">{call.label}</span>
              <span className="text-xs">{call.tease}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs">
          A hold is a camp — it keeps what you have, plus {pct(HOLD_LOOT)}, and none of the things that can happen to a
          camper (a wound, a haunting, a toll) happen to a Top on the checkpoint. The other four are pushes: they add the
          fork&apos;s loot and roll its harm, in the shape the role gives it. A scout&apos;s harm lands on the Jungle. A roam&apos;s
          is rolled on two cards. A kite takes half the loot for a quarter of the risk. A ward halves the lost and dead
          rolls and leaves the wound roll alone. None of them works at the Scouting Run&apos;s coin flip. In a convoy a hold
          counts as a camp, and a camp on either side camps the convoy.
        </p>
      </div>

      {/* ── Trail miles ──────────────────────────────────────────── */}
      <div data-testid="rule-miles" className="flex flex-col gap-2 rounded-lg border border-line bg-panel/60 p-3 text-sm text-steel">
        <h3 className="type-display text-lg text-white">Trail miles — a card remembers the roads it has walked</h3>
        <p>
          Every card that comes home alive is stamped with the run&apos;s miles:{" "}
          {TIER_ORDER.filter((key) => MILES_BY_TIER[key] > 0)
            .map((key) => `${EXPEDITION_TIERS[key].label} ${MILES_BY_TIER[key]}`)
            .join(", ")}
          . An Exorcism is a rite, not a road. Miles survive a wound and a mutation, and a card that dies takes them to the
          graveyard. Three titles, and a card holds the highest it has reached:
        </p>
        <ul className="grid gap-2 sm:grid-cols-3">
          {TRAIL_TITLES.map((title) => (
            <li key={title.key} data-testid={`rule-title-${title.key}`} className="flex flex-col gap-1 rounded-md border border-line bg-black/30 p-2.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: title.accent }}>
                {title.miles} miles
              </span>
              <span className="text-sm font-semibold text-white">{title.label}</span>
              <span className="text-xs">{title.does}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs">
          Only the card making the call has to be the Veteran — a Veteran Jungle does not make the Top better — and with
          two cards in a role the one with more miles makes it. A Veteran Top&apos;s hold pays {pct(VETERAN_HOLD_LOOT)}. A
          Wayfarer&apos;s {WAYFARER_SHINE} shine is a reason to send it again, never a way past a gate.
        </p>
      </div>

      {/* ── Edges, the road ahead, the camp, the league, the atlas ── */}
      <EdgeRules id={id} />
      <RoadAheadRules />
      <BaseCampRules />
      <LeagueGoalRules />
      <AtlasRules />

      {/* ── Mutations ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div>
          <h3 className="type-display text-lg text-white">What a card can come home as</h3>
          <p className="text-sm text-steel">
            One mutation per copy, permanent, drawn on the card everywhere it shows. Each one changes the card in
            Fantasy and on the market. An Exorcism removes Haunted or Cursed; nothing removes the rest.
          </p>
        </div>
        <div
          data-testid="rule-fragments"
          className="flex flex-col gap-1 rounded-lg border border-purple-300/50 bg-purple-500/10 p-3 text-sm text-steel"
        >
          <h4 className="text-sm font-bold text-purple-200">Map fragments — the key to the Legendary route</h4>
          <p>
            You cannot buy one. A fragment comes home with a Legend Hunt: <strong className="text-white">every</strong> Legend
            Hunt jackpot carries one, and {pct(FRAGMENT_CHANCE.legend?.solid ?? 0)} of solid Legend Hunts do. A Deep Raid
            jackpot carries one {pct(FRAGMENT_CHANCE.raid?.jackpot ?? 0)} of the time. A few forks can turn one up on a push,
            and a relic hunter met on the trail has one to trade {pct(HUNTER_FRAGMENT_CHANCE)} of the time. They stack in your
            supplies (the purple counter above the brief) and never expire. <strong className="text-white">{EXPEDITION_TIERS.legendary.fragments} fragments</strong> are
            spent to open one Legendary route; the route itself never drops one.
          </p>
        </div>
        <div data-testid="rule-trail" className="flex flex-col gap-2 rounded-lg border border-line bg-panel/60 p-3 text-sm text-steel">
          <h4 className="text-sm font-bold text-white">On the trail — what happens between the forks</h4>
          <p>
            Every run draws its route as a map with the squad moving along it, and keeps a journal that fills in as
            the hours pass — the route&apos;s own lines, and one from each card in the voice of the role it plays, none of
            them repeated inside a run. Between checkpoints, each leg has a {pct(ROAD_ENCOUNTER_CHANCE)} chance of an
            encounter. None of them asks you anything:
          </p>
          <ul className="flex flex-col gap-1 pl-4 [list-style:disc]">
            <li>
              <strong className="text-white">A merchant</strong> pays a flat {fmtPoints(MERCHANT_DOLLARS)} on top of whatever the run
              brings home.
            </li>
            <li>
              <strong className="text-white">A storm</strong> holds the squad up {STORM_HOURS} hours. The clock on the run moves with
              it, and so does every fork after it.
            </li>
            <li>
              <strong className="text-white">A cache</strong> left by an earlier expedition: {pct(CACHE_LOOT)} more loot.
            </li>
            <li>
              <strong className="text-white">A rival squad</strong> on the same trail. Beat them to the spot and it is {pct(RIVAL_WIN_LOOT)} more
              loot; lose the race and it is {pct(RIVAL_LOSS_LOOT)} less. The journal says which, the moment it happens.
            </li>
            <li>
              <strong className="text-white">A shrine</strong> at the roadside: the next fork&apos;s harm is rolled at{" "}
              {pct(SHRINE_RISK)} of its odds if you push there.
            </li>
            <li>
              <strong className="text-white">A relic hunter</strong> trading maps — {pct(HUNTER_FRAGMENT_CHANCE)} of the time they have a
              fragment.
            </li>
            <li>
              <strong className="text-white">A stranded card</strong> — only on a route that can lose one. The squad finds another
              collector&apos;s lost card and carries it home: they get it back wounded, you are paid a{" "}
              {fmtPoints(STRANDED_BOUNTY)} bounty by the house. Your own lost cards never come home this way.
            </li>
          </ul>
          <p>
            At each fork one of the squad has a word to say — a teammate vouching, a signed card offering the
            favour, a foil at a dark fork, a Jungle wanting to scout it. It is colour, not a hint: the odds on the buttons are the truth.{" "}
            <strong className="text-white">A squad already in the field when a rule changes keeps the rules it left with.</strong>
          </p>
        </div>
        <div data-testid="rule-convoy" className="flex flex-col gap-1 rounded-lg border border-gold/40 bg-gold/5 p-3 text-sm text-steel">
          <h4 className="text-sm font-bold text-gold">Convoys — two squads, one set of forks</h4>
          <p>
            Start a convoy at launch and you get a code. A partner joins the <strong className="text-white">same route</strong> with it
            before your first fork opens, and their squad rides your clock: every fork opens and closes for both of you at
            once, and both squads walk the <strong className="text-white">same road</strong> — the places are drawn for the convoy, not
            for each run. You each answer your own forks, and a fork <strong className="text-white">pushes only if you both push</strong> — a
            camp, a hold, or silence, on either side camps the convoy. Each squad still rolls its own loot and its own harm, so
            your partner&apos;s bad night is theirs. The channel hears every answer, with a mention for whoever still has to
            decide. A convoy nobody joins is just your run. Convoys meet everything on the trail but storms.
          </p>
        </div>
        <div
          data-testid="rule-matchday"
          className="grid gap-3 rounded-lg border border-mint/40 bg-mint/5 p-3 text-sm text-steel sm:grid-cols-2"
        >
          <div className="flex flex-col gap-1">
            <h4 className="text-sm font-bold text-mint">Match day</h4>
            <p>
              On a day a team plays, its cards bring home <strong className="text-white">{pct(SURGE_BONUS)} more</strong> from any
              run — one card of theirs on the squad is enough, and it stacks with the brief and the forks. Scored
              against the day you launch, like the brief; the banner above says who is on tonight.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <h4 className="text-sm font-bold text-gold">The echo</h4>
            <p>
              A <strong className="text-white">moment</strong> carried on a run has a {pct(ECHO_CHANCE)} chance to echo: the route drops
              a copy of a card from the game that moment happened in, either side, from that week&apos;s edition.
              A moment is never at risk out there — this is what it is for.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {MUTATIONS.map((mutation) => (
            <article
              key={mutation.key}
              data-testid={`rule-${mutation.key}`}
              className="flex flex-col gap-1.5 rounded-lg border border-line bg-panel/60 p-3 text-xs text-steel"
              style={{ borderColor: `${mutation.accent}55` }}
            >
              <h4 className="text-sm font-bold" style={{ color: mutation.accent }}>
                {mutation.label}
              </h4>
              <p className="text-white">{mutation.source}</p>
              <p>
                <span className="font-semibold text-white">Fantasy:</span> {mutation.fantasy}
              </p>
              <p>
                <span className="font-semibold text-white">Market:</span> {mutation.economy}
              </p>
            </article>
          ))}
        </div>
        <p className="text-xs text-steel">
          Where each comes from: {mutationSources()}; cursed by pushing a warned fork and having it go wrong; voidtouched by
          coming home from the Legendary route at all.
        </p>
      </div>
    </section>
  );
}

import type { ReactNode } from "react";
import { ARCHETYPE_ABILITIES } from "@/lib/expeditions/archetypes";
import { REVEAL_FRAGMENTS, TRAIL_SIGHT, type RevealedBy } from "@/lib/expeditions/reveal";
import { TRAIL_TITLES } from "@/lib/expeditions/trail";
import ExpeditionIcon from "../expeditionIcons";
import { fragmentsWord } from "./words";

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

export default function RoadAheadRules() {
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

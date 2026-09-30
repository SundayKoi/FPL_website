import { FALLBACK_ARCHETYPE } from "@/lib/cards/build";
import { ABILITY_KIND_LABELS, ARCHETYPE_ABILITIES, type AbilityKind } from "@/lib/expeditions/archetypes";
import ExpeditionIcon from "../expeditionIcons";

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

export default function EdgeRules({ id }: { id: string }) {
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

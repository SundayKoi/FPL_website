import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ExpeditionRules, { REVEAL_WAYS, edgeSlug } from "./ExpeditionRules";
import { ABILITY_KIND_LABELS, ARCHETYPE_ABILITIES, type AbilityKind } from "@/lib/expeditions/archetypes";
import { rewardWords } from "@/lib/expeditions/atlasWords";
import { CAMP_LINES, CAMP_PRICES, CAMP_UPGRADES, POLICY_LINE, priceLine } from "@/lib/expeditions/camp";
import { EXPEDITION_TIERS, ROAD_REWARDS, TIER_ORDER } from "@/lib/expeditions/config";
import { ROAD_SIZES } from "@/lib/expeditions/forks";
import { BOSS_HEALTH, LANDMARK_MILES, LEAGUE_GOAL_FRAGMENTS } from "@/lib/expeditions/league";
import { REVEAL_FRAGMENTS, REVEAL_ORDER } from "@/lib/expeditions/reveal";
import { TRAIL_TITLES } from "@/lib/expeditions/trail";

const EDGES = Object.values(ARCHETYPE_ABILITIES);
const text = (testId: string) => screen.getByTestId(testId).textContent ?? "";

describe("ExpeditionRules — edges", () => {
  it("prints every title in the table under its kind, with what it does", () => {
    render(<ExpeditionRules />);
    const section = screen.getByTestId("rule-edges");
    expect(within(section).getAllByTestId(/^rule-edge-/)).toHaveLength(EDGES.length);
    for (const edge of EDGES) {
      const group = within(section).getByTestId(`rule-edges-${edge.kind}`);
      const row = within(group).getByTestId(`rule-edge-${edgeSlug(edge.title)}`);
      expect(row.textContent).toContain(edge.title);
      expect(row.textContent).toContain(edge.does);
      expect(row.textContent).toContain(`strength ${edge.power} of`);
    }
  });

  it("groups by kind in the picker's words, the strongest first, collapsed to a tap target", () => {
    render(<ExpeditionRules />);
    const kinds = new Set(EDGES.map((edge) => edge.kind));
    const groups = screen.getAllByTestId(/^rule-edges-(?!stacking)/);
    expect(groups.map((group) => group.getAttribute("data-testid"))).toEqual(
      (Object.keys(ABILITY_KIND_LABELS) as AbilityKind[]).filter((kind) => kinds.has(kind)).map((kind) => `rule-edges-${kind}`),
    );
    for (const group of groups) {
      const kind = group.getAttribute("data-testid")!.slice("rule-edges-".length) as AbilityKind;
      expect(group.tagName).toBe("DETAILS");
      expect(group.hasAttribute("open")).toBe(false);
      const summary = group.querySelector("summary")!;
      expect(summary.textContent).toContain(ABILITY_KIND_LABELS[kind]);
      // Every title of the kind is in the summary, so a reader finds their
      // card's title without opening anything; 44px, for a thumb.
      for (const edge of EDGES.filter((row) => row.kind === kind)) expect(summary.textContent).toContain(edge.title);
      expect(summary.className).toContain("min-h-11");
      const powers = within(group)
        .getAllByTestId(/^rule-edge-/)
        .map((row) => EDGES.find((edge) => row.getAttribute("data-testid") === `rule-edge-${edgeSlug(edge.title)}`)!.power);
      expect(powers).toEqual([...powers].sort((a, b) => b - a));
    }
  });

  it("states the stacking rule in one sentence", () => {
    render(<ExpeditionRules />);
    expect(text("rule-edges-stacking")).toContain(
      "Only one edge of each kind counts in a squad: the strongest; a tie goes to the card with more trail miles.",
    );
  });

  it("gives every title its own row id", () => {
    expect(new Set(EDGES.map((edge) => edgeSlug(edge.title))).size).toBe(EDGES.length);
    expect(edgeSlug("Ice In The Veins")).toBe("ice-in-the-veins");
  });
});

describe("ExpeditionRules — base camp", () => {
  it("prices every level off the table the database charges, and says what it does", () => {
    render(<ExpeditionRules />);
    for (const upgrade of CAMP_UPGRADES) {
      const card = screen.getByTestId(`rule-camp-${upgrade}`);
      expect(card.textContent).toContain(CAMP_LINES[upgrade][0].title);
      CAMP_PRICES[upgrade].forEach((price, index) => {
        const level = within(card).getByTestId(`rule-camp-${upgrade}-${index + 1}`);
        expect(level.textContent).toContain(priceLine(price));
        expect(level.textContent).toContain(CAMP_LINES[upgrade][index].does);
      });
    }
    expect(text("rule-camp-tent-2")).toContain("Level 2 · A bigger tent · $1,200 + 1 map fragment");
    expect(text("rule-camp-slot")).toContain("A second scouting squad (squad slot)");
    // A plain word that is already the game's word is not said twice.
    expect(text("rule-camp-tent")).not.toContain("(tent)");
    expect(text("rule-camp-policy")).toContain(priceLine(CAMP_PRICES.policy[0]));
    expect(text("rule-camp-policy")).toContain(POLICY_LINE.does);
    expect(text("rule-camp-total")).toBe("$5,300 + 3 map fragments");
  });
});

describe("ExpeditionRules — the league's expedition of the week", () => {
  it("says both kinds of goal, their sizes and the reward", () => {
    render(<ExpeditionRules />);
    expect(text("rule-league-landmark")).toContain(`${LANDMARK_MILES} miles away`);
    expect(text("rule-league-landmark")).toContain(`${EXPEDITION_TIERS.scout.label} 1`);
    expect(text("rule-league-boss")).toContain(`${BOSS_HEALTH} health`);
    expect(LEAGUE_GOAL_FRAGMENTS).toBe(1);
    expect(text("rule-league-reward")).toContain("one map fragment");
    expect(text("rule-league-reward")).toContain("Vanguard");
    expect(text("rule-league-reward")).toContain("not dollars");
  });
});

describe("ExpeditionRules — the road ahead", () => {
  it("names every way reveal.ts knows a checkpoint", () => {
    expect(new Set(Object.keys(REVEAL_WAYS))).toEqual(new Set(REVEAL_ORDER));
    render(<ExpeditionRules />);
    for (const by of REVEAL_ORDER) expect(screen.getByTestId(`rule-reveal-${by}`)).toBeTruthy();
    expect(text("rule-road-ahead")).toContain("?");
    expect(text("rule-road-ahead")).toContain("dread mark");
  });

  it("reads each reveal's reach and price off its module", () => {
    render(<ExpeditionRules />);
    const [trailworn, veteran, wayfarer] = TRAIL_TITLES;
    expect(text("rule-reveal-trail")).toContain(
      `A ${trailworn.label} card knows the next checkpoint; a ${veteran.label}, the next two checkpoints; a ${wayfarer.label}, the whole road.`,
    );
    expect(REVEAL_FRAGMENTS).toBe(1);
    expect(text("rule-reveal-fragment")).toContain("Spend one map fragment");
    for (const edge of EDGES.filter((row) => row.kind === "reveal")) {
      expect(text("rule-reveal-edge")).toContain(edge.title);
      expect(text("rule-reveal-edge")).toContain(edge.does);
    }
  });
});

describe("ExpeditionRules — the atlas", () => {
  it("lists every road with its size and what walking it pays", () => {
    render(<ExpeditionRules />);
    for (const tier of TIER_ORDER) {
      if (ROAD_SIZES[tier] === 0) {
        expect(screen.queryByTestId(`rule-road-${tier}`)).toBeNull();
        continue;
      }
      const row = text(`rule-road-${tier}`);
      expect(row).toContain(EXPEDITION_TIERS[tier].label);
      expect(row).toContain(`${ROAD_SIZES[tier]} places`);
      expect(row).toContain(rewardWords(ROAD_REWARDS[tier]));
    }
    expect(text("rule-road-legendary")).toContain("2 map fragments and a free pack");
  });

  it("says who a place is named after without the league goal's word", () => {
    render(<ExpeditionRules />);
    expect(text("rule-atlas-named")).toContain("Places named after their first visitor.");
    expect(text("rule-atlas").toLowerCase()).not.toContain("landmark");
  });
});

describe("ExpeditionRules — plain words", () => {
  it("never says shine in the new sections — the board's word is power", () => {
    render(<ExpeditionRules />);
    for (const id of ["rule-road-ahead", "rule-base-camp", "rule-league", "rule-atlas"]) {
      expect(text(id).toLowerCase(), id).not.toContain("shine");
    }
  });
});

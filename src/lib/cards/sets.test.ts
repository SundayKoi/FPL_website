import { describe, expect, it } from "vitest";
import { buildWeekSets, completedSetCount, TEAM_SET_BONUS, type SetCopy } from "./sets";
import type { PlayerCardData } from "./build";

const WEEK = "2026-08-24";
const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"] as const;

function card(over: Partial<PlayerCardData> = {}): PlayerCardData {
  return {
    slug: `${over.name ?? "player"}-na1`.toLowerCase(),
    name: "Player",
    teamName: "Wolves",
    teamImageUrl: null,
    role: "Mid",
    overall: 70,
    signature: { champion: "Ahri", games: 4 },
    standout: false,
    subStats: [],
    ...over,
  } as unknown as PlayerCardData;
}

/** One team fielding all five roles — the shape a set can be asked of. */
function roster(teamName: string, prefix = ""): PlayerCardData[] {
  return ROLES.map((role) => card({ name: `${prefix}${role}`, role, teamName }));
}

function copy(id: number, slug: string, editionWeek = WEEK): SetCopy {
  return { id, slug, editionWeek };
}

/** Every slug on a roster, as owned copies numbered from `from`. */
function ownAll(cards: PlayerCardData[], from = 1): SetCopy[] {
  return cards.map((c, i) => copy(from + i, c.slug));
}

describe("buildWeekSets", () => {
  it("asks for the five who played that week, and completes when all five are held", () => {
    const cards = roster("Wolves");
    const sets = buildWeekSets(cards, ownAll(cards), WEEK);

    expect(sets).toHaveLength(1);
    expect(sets[0].members).toHaveLength(5);
    expect(sets[0].members.map((m) => m.role)).toEqual([...ROLES]);
    expect(sets[0].complete).toBe(true);
    expect(sets[0].ownedCount).toBe(5);
    expect(sets[0].copyIds).toEqual([1, 2, 3, 4, 5]);
  });

  it("does not complete on four of five, and spends nothing while chasing", () => {
    const cards = roster("Wolves");
    const sets = buildWeekSets(cards, ownAll(cards).slice(0, 4), WEEK);

    expect(sets[0].complete).toBe(false);
    expect(sets[0].ownedCount).toBe(4);
    // Nothing is at risk until it is finished.
    expect(sets[0].copyIds).toEqual([]);
    expect(sets[0].members.find((m) => m.copyId === null)?.role).toBe("Support");
  });

  it("counts only copies from the set's own week", () => {
    // The whole reason a set is asked of an edition: last week's copy of
    // the same player is a different collectible and must not fill a slot.
    const cards = roster("Wolves");
    const wrongWeek = ownAll(cards).map((c) => ({ ...c, editionWeek: "2026-08-17" }));
    expect(buildWeekSets(cards, wrongWeek, WEEK)[0].ownedCount).toBe(0);
  });

  it("ignores copies already spent on a claim", () => {
    // Five cards passed between collectors must not pay twice.
    const cards = roster("Wolves");
    const copies = ownAll(cards);
    const sets = buildWeekSets(cards, copies, WEEK, new Set([3]));

    expect(sets[0].complete).toBe(false);
    expect(sets[0].ownedCount).toBe(4);
  });

  it("spends the oldest duplicate, so the button can't change its mind", () => {
    const cards = roster("Wolves");
    const copies = [...ownAll(cards, 10), copy(2, cards[0].slug)];
    const set = buildWeekSets(cards, copies, WEEK)[0];

    expect(set.members[0].copyId).toBe(2);
    expect(set.copyIds).toEqual([2, 11, 12, 13, 14]);
  });

  it("skips a team that didn't field all five roles that week", () => {
    // "Collect the five who played" has no answer when only four did, and
    // an unachievable row is noise in a list of things to chase.
    const short = roster("Wolves").slice(0, 4);
    expect(buildWeekSets(short, ownAll(short), WEEK)).toEqual([]);
  });

  it("orders finished sets first, then by how few are left", () => {
    const wolves = roster("Wolves", "w");
    const bears = roster("Bears", "b");
    const hawks = roster("Hawks", "h");
    const sets = buildWeekSets(
      [...wolves, ...bears, ...hawks],
      [...ownAll(bears, 1), ...ownAll(hawks, 10).slice(0, 3), ...ownAll(wolves, 20).slice(0, 1)],
      WEEK,
    );

    expect(sets.map((s) => s.teamName)).toEqual(["Bears", "Hawks", "Wolves"]);
    expect(completedSetCount(sets)).toBe(1);
  });

  it("pays a flat hundred", () => {
    expect(TEAM_SET_BONUS).toBe(100);
  });
});

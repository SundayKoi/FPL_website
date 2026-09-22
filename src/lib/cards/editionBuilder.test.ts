import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerCardData } from "./build";

// The two reads are somebody else's tested job; the decision between them
// is this module's, and sendoff.ts stays real so the rule under test is the
// rule that ships.
const { fetchSeasonFixtures, fetchWeekCards } = vi.hoisted(() => ({
  fetchSeasonFixtures: vi.fn(),
  fetchWeekCards: vi.fn(),
}));
vi.mock("./queries", () => ({ fetchSeasonFixtures, fetchWeekCards }));

const { buildEditionForWeek } = await import("./editionBuilder");

const supabase = {} as SupabaseClient;
const WEEK = "2026-09-07";
/** 8 PM ET on Monday 2026-09-07. */
const MONDAY_8PM = "2026-09-08T00:00:00.000Z";

function card(overrides: Partial<PlayerCardData> = {}): PlayerCardData {
  return { slug: "a", name: "A", teamName: "Ember", role: "Mid", overall: 80, standout: false, ...overrides } as PlayerCardData;
}

beforeEach(() => {
  fetchSeasonFixtures.mockReset();
  fetchWeekCards.mockReset();
  fetchSeasonFixtures.mockResolvedValue([]);
  fetchWeekCards.mockResolvedValue([card()]);
});

describe("buildEditionForWeek", () => {
  it("prints the week's own build on an ordinary week, without touching the season one", async () => {
    const seasonCards = vi.fn(async () => [card()]);

    const edition = await buildEditionForWeek(supabase, "S5", WEEK, seasonCards);

    expect(edition.kind).toBe("weekly");
    expect(edition.plan).toBeNull();
    expect(fetchWeekCards).toHaveBeenCalledWith(supabase, "S5", WEEK);
    // The archiver passes a thunk precisely so an ordinary week never pays
    // for a whole-season read it will not use.
    expect(seasonCards).not.toHaveBeenCalled();
  });

  it("prints a send-off off the season build when the bracket ended a split", async () => {
    fetchSeasonFixtures.mockResolvedValue([
      { stage: "finals", team_a: "Storm", team_b: "Ember", score_a: 3, score_b: 1, scheduled_at: MONDAY_8PM },
    ]);

    const edition = await buildEditionForWeek(supabase, "S5", WEEK, async () => [card()]);

    expect(edition.kind).toBe("sendoff");
    expect(edition.cards.map((c) => c.sendoff?.stage)).toEqual(["finalist"]);
    expect(edition.plan?.exits).toEqual(["finals"]);
    // Both builds are read: the fallen print out of the season one, the
    // teams through out of the week's.
    expect(fetchWeekCards).toHaveBeenCalledWith(supabase, "S5", WEEK);
  });

  it("prints the team that went through off the week build", async () => {
    // A finalist is rated against the league; a team still playing is
    // rated on the night it just won.
    fetchSeasonFixtures.mockResolvedValue([
      { stage: "semifinals", team_a: "Storm", team_b: "Ember", score_a: 3, score_b: 1, scheduled_at: MONDAY_8PM },
    ]);
    fetchWeekCards.mockResolvedValue([card({ slug: "storm-week", teamName: "Storm", overall: 60 })]);

    const edition = await buildEditionForWeek(supabase, "S5", WEEK, async () => [
      card({ slug: "ember-season", teamName: "Ember", overall: 90 }),
      card({ slug: "storm-season", teamName: "Storm", overall: 95 }),
    ]);

    expect(edition.plan?.advancing).toEqual(["Storm"]);
    expect(edition.cards.map((c) => c.slug).sort()).toEqual(["ember-season", "storm-week"]);
    expect(edition.cards.find((c) => c.slug === "storm-week")?.sendoff).toBeUndefined();
    expect(edition.plan?.unmatched).toEqual([]);
  });

  it("prints nothing for a playoff week nobody has scored yet", async () => {
    // archiveEdition treats empty cards as "leave the week alone", so the
    // week simply waits for the scores instead of being filled with a
    // ten-player weekly edition.
    fetchSeasonFixtures.mockResolvedValue([
      { stage: "semifinals", team_a: "Storm", team_b: "Ember", score_a: null, score_b: null, scheduled_at: MONDAY_8PM },
    ]);

    const edition = await buildEditionForWeek(supabase, "S5", WEEK, async () => [card()]);

    expect(edition).toMatchObject({ kind: "sendoff", cards: [] });
  });
});

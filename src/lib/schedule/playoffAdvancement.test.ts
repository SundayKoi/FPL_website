import { describe, expect, it } from "vitest";
import type { BracketFixture } from "./bracketSeed";
import { planPlayoffAdvancement, type PlayoffFixtureResult } from "./playoffAdvancement";

const quarterfinal = (over: Partial<BracketFixture> = {}): BracketFixture => ({
  stage: "quarterfinals",
  sort_order: 0,
  team_a: "Flannel Esports Requiem",
  team_b: "Astronauts",
  best_of: 5,
  scheduled_at: "2026-09-21T20:00:00-04:00",
  winner_to: { stage: "semifinals", sort_order: 0, side: "team_b" },
  ...over,
});

const semifinal = (over: Partial<BracketFixture> = {}): BracketFixture => ({
  stage: "semifinals",
  sort_order: 0,
  team_a: "Divine Ascension",
  team_b: null,
  best_of: 5,
  scheduled_at: "2026-09-28T20:00:00-04:00",
  winner_to: { stage: "finals", sort_order: 0, side: "team_a" },
  ...over,
});

const final = (over: Partial<BracketFixture> = {}): BracketFixture => ({
  stage: "finals",
  sort_order: 0,
  team_a: null,
  team_b: null,
  best_of: 5,
  scheduled_at: "2026-10-05T20:00:00-04:00",
  ...over,
});

const result = (
  config: BracketFixture,
  over: Partial<PlayoffFixtureResult> = {},
): PlayoffFixtureResult => ({
  ...config,
  id: `${config.stage}-${config.sort_order}`,
  score_a: null,
  score_b: null,
  resultEvidence: "verified",
  ...over,
});

describe("planPlayoffAdvancement", () => {
  it("routes a quarterfinal winner to its configured semifinal opponent slot", () => {
    const qf = quarterfinal();
    const semi = semifinal();
    const plan = planPlayoffAdvancement(
      [result(qf, { score_a: 1, score_b: 3 }), result(semi), result(final())],
      [qf, semi, final()],
    );

    expect(plan.updates).toEqual([
      {
        id: "semifinals-0",
        stage: "semifinals",
        sort_order: 0,
        destination: { stage: "semifinals", sort_order: 0, side: "team_b" },
        winner: "Astronauts",
      },
    ]);
    expect(plan.conflicts).toEqual([]);
  });

  it("waits for an incomplete score pair", () => {
    const qf = quarterfinal();
    const semi = semifinal();
    const plan = planPlayoffAdvancement(
      [result(qf, { score_a: 3 }), result(semi), result(final())],
      [qf, semi, final()],
    );

    expect(plan.updates).toEqual([]);
    expect(plan.pending).toEqual([
      "quarterfinals #0 has no complete result yet.",
      "semifinals #0 has no complete result yet.",
    ]);
  });

  it("waits until the latest linked report is fully ingested", () => {
    const qf = quarterfinal();
    const semi = semifinal();
    const plan = planPlayoffAdvancement(
      [result(qf, { score_a: 1, score_b: 3, resultEvidence: "pending" }), result(semi, { resultEvidence: "pending" }), result(final())],
      [qf, semi, final()],
    );

    expect(plan.updates).toEqual([]);
    expect(plan.pending).toEqual([
      "quarterfinals #0 has no clean, completed match-report ingest yet.",
      "semifinals #0 has no clean, completed match-report ingest yet.",
    ]);
  });

  it("blocks advancement when the ingested report has a score warning", () => {
    const qf = quarterfinal();
    const semi = semifinal();
    const plan = planPlayoffAdvancement(
      [result(qf, { score_a: 1, score_b: 3, resultEvidence: "conflict" }), result(semi), result(final())],
      [qf, semi, final()],
    );

    expect(plan.updates).toEqual([]);
    expect(plan.conflicts).toEqual([
      "quarterfinals #0 has an ingested match-report warning; review it before advancing a team.",
    ]);
  });

  it("does not advance a score that has not clinched the best-of-five", () => {
    const qf = quarterfinal();
    const semi = semifinal();
    const plan = planPlayoffAdvancement(
      [result(qf, { score_a: 2, score_b: 1 }), result(semi), result(final())],
      [qf, semi, final()],
    );

    expect(plan.updates).toEqual([]);
    expect(plan.conflicts).toEqual([
      "quarterfinals #0 has 2-1, which does not end a Bo5 series at 3 wins.",
    ]);
  });

  it("routes semifinal winners into their configured finals slots", () => {
    const semi0 = semifinal({ winner_to: { stage: "finals", sort_order: 0, side: "team_a" } });
    const semi1 = semifinal({
      sort_order: 1,
      team_a: "Flannel Esports Love Tap",
      winner_to: { stage: "finals", sort_order: 0, side: "team_b" },
    });
    const championship = final();
    const plan = planPlayoffAdvancement(
      [
        result(semi0, { team_b: "Astronauts", score_a: 3, score_b: 2 }),
        result(semi1, { team_b: "The Strokers", score_a: 1, score_b: 3 }),
        result(championship),
      ],
      [semi0, semi1, championship],
    );

    expect(plan.updates.map(({ destination, winner }) => [destination.side, winner])).toEqual([
      ["team_a", "Divine Ascension"],
      ["team_b", "The Strokers"],
    ]);
  });

  it("is idempotent and refuses to overwrite a different scheduled opponent", () => {
    const qf = quarterfinal();
    const semi = semifinal();
    const championship = final();
    const rows = [
      result(qf, { score_a: 3, score_b: 1 }),
      result(semi, { team_b: "Flannel Esports Requiem" }),
      result(championship),
    ];

    const done = planPlayoffAdvancement(rows, [qf, semi, championship]);
    expect(done.alreadySet).toMatchObject([{ id: "semifinals-0", winner: "Flannel Esports Requiem" }]);
    expect(done.updates).toEqual([]);

    const conflict = planPlayoffAdvancement(
      [rows[0], result(semi, { team_b: "The Strokers" }), rows[2]],
      [qf, semi, championship],
    );
    expect(conflict.conflicts).toEqual([
      "semifinals #0 team_b is already The Strokers, not Flannel Esports Requiem.",
    ]);
  });
});

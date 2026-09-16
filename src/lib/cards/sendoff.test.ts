import { describe, expect, it } from "vitest";
import type { PlayerCardData } from "./build";
import {
  EXIT_LABELS,
  SENDOFF_META,
  SENDOFF_VAULT_DAYS,
  crownSendoff,
  eliminationsInWeek,
  exitsInWeek,
  isPlayoffWeek,
  isSendoffVaulted,
  planSendoff,
  sendoffEditionLabel,
  sendoffLedger,
  sendoffVaultClosesAt,
  sendoffWeekLabel,
  withSendoff,
  type SendoffFixture,
} from "./sendoff";

/** One fixture row, only the columns the planner reads. */
function fx(
  stage: string,
  teamA: string | null,
  teamB: string | null,
  scoreA: number | null,
  scoreB: number | null,
  scheduledAt: string | null,
): SendoffFixture {
  return { stage, team_a: teamA, team_b: teamB, score_a: scoreA, score_b: scoreB, scheduled_at: scheduledAt };
}

/** A season-rated card, only what the planner and the crowning touch. */
function card(overrides: Partial<PlayerCardData> = {}): PlayerCardData {
  return {
    slug: "player-na1",
    name: "Player",
    teamName: "Storm",
    role: "Mid",
    overall: 80,
    standout: false,
    ...overrides,
  } as PlayerCardData;
}

// Monday 2026-09-07 Eastern; the bracket plays Monday nights at 8 PM ET.
const WEEK = "2026-09-07";
const MONDAY_8PM = "2026-09-08T00:00:00.000Z";

describe("eliminationsInWeek", () => {
  it("stamps every team a gauntlet week knocked out", () => {
    const eliminations = eliminationsInWeek(
      [
        fx("gauntlet_r1", "Storm", "Ember", 2, 0, MONDAY_8PM),
        fx("gauntlet_r1", "Vale", "Kite", 0, 2, MONDAY_8PM),
        fx("gauntlet_r2", "Storm", "Kite", 2, 1, MONDAY_8PM),
      ],
      WEEK,
    );

    expect(eliminations.map((e) => e.team)).toEqual(["Ember", "Kite", "Vale"]);
    expect(eliminations.every((e) => e.stage === "gauntlet")).toBe(true);
    expect(eliminations.find((e) => e.team === "Ember")).toMatchObject({
      exit: "gauntlet_r1",
      series: "0–2",
      opponent: "Storm",
      week: WEEK,
    });
  });

  it("stamps a team once, at the round it actually fell in", () => {
    // Kite won r1 and lost r2 — it appears in two fixtures the same night.
    // Printing it twice would be two playoff cards for one player, and
    // printing the EARLIER exit would credit it with less than it got.
    const eliminations = eliminationsInWeek(
      [
        fx("gauntlet_r1", "Kite", "Vale", 2, 0, MONDAY_8PM),
        fx("gauntlet_r2", "Storm", "Kite", 2, 1, MONDAY_8PM),
      ],
      WEEK,
    );

    expect(eliminations.filter((e) => e.team === "Kite")).toHaveLength(1);
    expect(eliminations.find((e) => e.team === "Kite")?.exit).toBe("gauntlet_r2");
  });

  it("sends the finals off as a finalist and a champion", () => {
    const eliminations = eliminationsInWeek([fx("finals", "Storm", "Ember", 3, 1, MONDAY_8PM)], WEEK);

    expect(eliminations.map((e) => [e.team, e.stage, e.series])).toEqual([
      ["Ember", "finalist", "1–3"],
      ["Storm", "champion", "3–1"],
    ]);
  });

  it("eliminates nobody off a tied or unscored fixture", () => {
    // A half-entered row would otherwise stamp somebody's one playoff card
    // with a result that never happened, and editions freeze at mint.
    expect(eliminationsInWeek([fx("semifinals", "Storm", "Ember", null, null, MONDAY_8PM)], WEEK)).toEqual([]);
    expect(eliminationsInWeek([fx("semifinals", "Storm", "Ember", 1, 1, MONDAY_8PM)], WEEK)).toEqual([]);
    expect(eliminationsInWeek([fx("semifinals", "Storm", "Ember", 2, null, MONDAY_8PM)], WEEK)).toEqual([]);
  });

  it("files a Sunday-night Eastern fixture in the week that Sunday belongs to", () => {
    // 9 PM ET Sunday 2026-09-13 is 01:00 UTC on Monday the 14th. Reading
    // the UTC date would push the send-off into the NEXT edition.
    const sundayNight = "2026-09-14T01:00:00.000Z";

    expect(eliminationsInWeek([fx("finals", "Storm", "Ember", 3, 0, sundayNight)], WEEK)).toHaveLength(2);
    expect(eliminationsInWeek([fx("finals", "Storm", "Ember", 3, 0, sundayNight)], "2026-09-14")).toEqual([]);
  });

  it("ignores regular-season and undated fixtures", () => {
    expect(eliminationsInWeek([fx("week_5", "Storm", "Ember", 2, 0, MONDAY_8PM)], WEEK)).toEqual([]);
    expect(eliminationsInWeek([fx("finals", "Storm", "Ember", 3, 0, null)], WEEK)).toEqual([]);
  });
});

describe("isPlayoffWeek", () => {
  it("is true for a playoff fixture nobody has scored yet", () => {
    // The point of the flag: an unscored playoff week prints NOTHING, not a
    // ten-player weekly edition rating the semifinalists against each other.
    expect(isPlayoffWeek([fx("quarterfinals", "Storm", "Ember", null, null, MONDAY_8PM)], WEEK)).toBe(true);
  });

  it("is false for a regular-season week and for another week's bracket", () => {
    expect(isPlayoffWeek([fx("week_5", "Storm", "Ember", 2, 0, MONDAY_8PM)], WEEK)).toBe(false);
    expect(isPlayoffWeek([fx("finals", "Storm", "Ember", 3, 0, MONDAY_8PM)], "2026-08-31")).toBe(false);
  });
});

describe("exitsInWeek", () => {
  it("lists a week's rounds earliest first, deduplicated", () => {
    expect(
      exitsInWeek(
        [
          fx("gauntlet_r2", "Storm", "Kite", 2, 1, MONDAY_8PM),
          fx("gauntlet_r1", "Storm", "Ember", 2, 0, MONDAY_8PM),
          fx("gauntlet_r1", "Vale", "Kite", 0, 2, MONDAY_8PM),
        ],
        WEEK,
      ),
    ).toEqual(["gauntlet_r1", "gauntlet_r2"]);
  });
});

describe("planSendoff", () => {
  const fixtures = [fx("quarterfinals", "Storm", "Ember", 2, 0, MONDAY_8PM)];
  const cards = [
    card({ slug: "a", name: "A", teamName: "EMBER", role: "Mid", overall: 90, standout: true }),
    card({ slug: "b", name: "B", teamName: "ember", role: "Mid", overall: 70 }),
    card({ slug: "c", name: "C", teamName: "Ember", role: "Top", overall: 60 }),
    card({ slug: "d", name: "D", teamName: "Storm", role: "Mid", overall: 95, standout: true }),
  ];

  it("prints only the eliminated team, matching the name however it is spelled", () => {
    const plan = planSendoff(cards, fixtures, WEEK);

    expect(plan.cards.map((c) => c.slug).sort()).toEqual(["a", "b", "c"]);
    expect(plan.cards.every((c) => c.sendoff?.stage === "quarterfinalist")).toBe(true);
    expect(plan.cards[0].sendoff).toMatchObject({ exit: "quarterfinals", team: "Ember", series: "0–2", week: WEEK });
  });

  it("drops the season crown and crowns one card per role among the printed", () => {
    // The season's Card of the Week was judged against the whole league; a
    // send-off edition's five Eclipse slots belong to the cards it prints.
    const plan = planSendoff(cards, fixtures, WEEK);

    expect(plan.cards.filter((c) => c.standout).map((c) => c.slug)).toEqual(["a", "c"]);
    expect(plan.cards.find((c) => c.slug === "b")?.standout).toBe(false);
  });

  it("reports an eliminated team no card matched", () => {
    const plan = planSendoff([card({ teamName: "Storm" })], fixtures, WEEK);

    expect(plan.cards).toEqual([]);
    expect(plan.unmatched).toEqual(["Ember"]);
  });

  it("carries the week's exits for the edition label", () => {
    expect(planSendoff(cards, fixtures, WEEK).exits).toEqual(["quarterfinals"]);
    expect(sendoffWeekLabel(planSendoff(cards, fixtures, WEEK).exits)).toBe("Send-off · Quarterfinals");
  });

  it("plans an empty edition for a week whose fixtures are undecided", () => {
    const plan = planSendoff(cards, [fx("finals", "Storm", "Ember", null, null, MONDAY_8PM)], WEEK);

    expect(plan.cards).toEqual([]);
    expect(plan.eliminations).toEqual([]);
    expect(plan.exits).toEqual(["finals"]);
  });
});

describe("the vault", () => {
  it("closes two weeks after the finals", () => {
    const closesAt = sendoffVaultClosesAt([fx("finals", "Storm", "Ember", 3, 0, "2026-09-08T00:00:00.000Z")]);

    expect(closesAt).toBe("2026-09-22T00:00:00.000Z");
    expect(SENDOFF_VAULT_DAYS).toBe(14);
  });

  it("takes the later of two dated finals rows", () => {
    // A duplicate finals fixture is a data error. Selling for too long beats
    // shutting early on people who were promised a fortnight.
    expect(
      sendoffVaultClosesAt([
        fx("finals", "Storm", "Ember", 3, 0, "2026-09-08T00:00:00.000Z"),
        fx("finals", "Storm", "Ember", 3, 0, "2026-09-15T00:00:00.000Z"),
      ]),
    ).toBe("2026-09-29T00:00:00.000Z");
  });

  it("knows no closing date until the finals are scheduled", () => {
    expect(sendoffVaultClosesAt([fx("finals", "Storm", "Ember", null, null, null)])).toBeNull();
    expect(sendoffVaultClosesAt([fx("semifinals", "Storm", "Ember", 2, 0, MONDAY_8PM)])).toBeNull();
  });

  it("stays open until the closing instant, and while no date is known", () => {
    const fixtures = [fx("finals", "Storm", "Ember", 3, 0, "2026-09-08T00:00:00.000Z")];

    expect(isSendoffVaulted(fixtures, new Date("2026-09-21T23:59:00.000Z"))).toBe(false);
    expect(isSendoffVaulted(fixtures, new Date("2026-09-22T00:00:00.000Z"))).toBe(true);
    // An unscheduled finals must not shut the shop.
    expect(isSendoffVaulted([fx("finals", "Storm", "Ember", null, null, null)], new Date("2099-01-01"))).toBe(false);
  });
});

describe("sendoffLedger", () => {
  const fixtures = [
    fx("quarterfinals", "Storm", "Ember", 2, 0, MONDAY_8PM),
    fx("semifinals", "Storm", "Kite", null, null, "2026-09-15T00:00:00.000Z"),
  ];
  const cards = [
    card({ slug: "a", teamName: "Ember" }),
    card({ slug: "b", teamName: "Ember" }),
    card({ slug: "c", teamName: "Storm" }),
    card({ slug: "d", teamName: "Bench Mob" }),
  ];

  it("marks printed, alive and unscheduled teams", () => {
    const ledger = sendoffLedger(cards, fixtures, "2026-09-14");

    expect(ledger).toEqual([
      { team: "Ember", status: "printed", stage: "quarterfinalist", week: WEEK, cards: 2 },
      { team: "Kite", status: "alive", stage: null, week: null, cards: 0 },
      { team: "Storm", status: "alive", stage: null, week: null, cards: 1 },
      { team: "Bench Mob", status: "unscheduled", stage: null, week: null, cards: 1 },
    ]);
  });

  it("ignores weeks past the one asked about", () => {
    // The ledger answers "what has printed by now", so a decided fixture in
    // a later week must not report a team as already sent off. (8 PM ET on
    // Monday the 21st — the week after the one asked about.)
    const decidedLater = [fx("semifinals", "Storm", "Kite", 2, 0, "2026-09-22T00:00:00.000Z")];

    expect(sendoffLedger(cards, decidedLater, "2026-09-14").every((row) => row.status !== "printed")).toBe(true);
    // Still in the bracket, waiting on a round nobody has played yet.
    expect(sendoffLedger(cards, decidedLater, "2026-09-14").find((row) => row.team === "Kite")?.status).toBe("alive");
  });
});

describe("labels", () => {
  it("names one card by its stamp and one edition by its round", () => {
    expect(sendoffEditionLabel("champion")).toBe("Send-off · Champion");
    expect(sendoffWeekLabel(["gauntlet_r1", "gauntlet_r2"])).toBe(`Send-off · ${EXIT_LABELS.gauntlet_r2}`);
    expect(sendoffWeekLabel([])).toBeNull();
  });
});

describe("withSendoff / crownSendoff", () => {
  it("clears the season crown as it stamps", () => {
    const stamped = withSendoff(card({ standout: true }), {
      stage: "finalist",
      exit: "finals",
      team: "Ember",
      series: "1–3",
      week: WEEK,
    });

    expect(stamped.standout).toBe(false);
    expect(stamped.sendoff?.stage).toBe("finalist");
    expect(SENDOFF_META[stamped.sendoff!.stage].stamp).toBe("FINALIST");
  });

  it("crowns the best card in each role, best first", () => {
    const crowned = crownSendoff([
      card({ slug: "low-mid", role: "Mid", overall: 70 }),
      card({ slug: "top", role: "Top", overall: 65 }),
      card({ slug: "high-mid", role: "Mid", overall: 90 }),
    ]);

    expect(crowned.map((c) => c.slug)).toEqual(["high-mid", "low-mid", "top"]);
    expect(crowned.filter((c) => c.standout).map((c) => c.slug)).toEqual(["high-mid", "top"]);
  });
});

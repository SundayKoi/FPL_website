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
  firstPlayoffWeek,
  type SendoffFixture, eliminationsSoFar, stampSendoffs, advancingInWeek, weekRoster } from "./sendoff";

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

/** A season card with a record on it: 8-2 over the season, 1-2 once the
 *  bracket started. The sub who played two regular-season games and one
 *  gauntlet night is the case the record line exists for. */
function recorded(overrides: Partial<PlayerCardData> = {}): PlayerCardData {
  return card({
    wins: 8,
    losses: 2,
    winratePct: 80,
    level: 10,
    playoffs: { wins: 1, losses: 2 },
    ...overrides,
  });
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

describe("firstPlayoffWeek", () => {
  it("is the earliest week an exit-stage fixture is scheduled in", () => {
    expect(
      firstPlayoffWeek([
        fx("finals", "Alpha", "Bravo", null, null, "2026-09-22T00:00:00.000Z"),
        fx("gauntlet_r1", "Alpha", "Bravo", null, null, MONDAY_8PM),
        fx("week_5", "Alpha", "Bravo", 2, 0, "2026-08-25T00:00:00.000Z"),
      ]),
    ).toBe(WEEK);
  });

  it("is null for a season whose bracket has not been scheduled", () => {
    expect(firstPlayoffWeek([fx("week_5", "Alpha", "Bravo", 2, 0, MONDAY_8PM)])).toBeNull();
    expect(firstPlayoffWeek([])).toBeNull();
  });

  it("ignores a playoff fixture with no date on it", () => {
    // A round in the bracket with no kickoff time cannot start the cut —
    // it would either be guessed or swallow the whole season.
    expect(firstPlayoffWeek([fx("semifinals", "Alpha", "Bravo", null, null, null)])).toBeNull();
    expect(
      firstPlayoffWeek([
        fx("semifinals", "Alpha", "Bravo", null, null, null),
        fx("finals", "Alpha", "Bravo", null, null, MONDAY_8PM),
      ]),
    ).toBe(WEEK);
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
  // The same player as season card "d", rated on the week instead: what a
  // team that went through actually prints.
  const weekCards = [card({ slug: "d", name: "D", teamName: "Storm", role: "Mid", overall: 60, standout: true })];

  it("stamps the fallen team, matching the name however it is spelled, and prints the team through plain", () => {
    const plan = planSendoff(cards, fixtures, WEEK, weekCards);

    expect(plan.cards.map((c) => c.slug).sort()).toEqual(["a", "b", "c", "d"]);
    const fallen = plan.cards.filter((c) => c.slug !== "d");
    expect(fallen.every((c) => c.sendoff?.stage === "quarterfinalist")).toBe(true);
    expect(fallen[0].sendoff).toMatchObject({ exit: "quarterfinals", team: "Ember", series: "0–2", week: WEEK });
    // Storm went through: an unstamped card in the same edition.
    expect(plan.cards.find((c) => c.slug === "d")?.sendoff).toBeUndefined();
    expect(plan.advancing).toEqual(["Storm"]);
  });

  it("prints the team through off the WEEK build, not the season one", () => {
    // The rule itself: a team still in the bracket prints the card the week
    // it just played earned it, and only a finished split is rated against
    // the whole league.
    const plan = planSendoff(cards, fixtures, WEEK, weekCards);

    expect(plan.cards.find((c) => c.slug === "d")?.overall).toBe(60);
    expect(plan.cards.find((c) => c.slug === "a")?.overall).toBe(90);
  });

  it("drops both builds' crowns and crowns one card per role, judged on the week", () => {
    // The season's Card of the Week was judged against the whole league and
    // the week's against the week; a send-off edition's five Eclipse slots
    // belong to the cards it prints, awarded on the week they all played.
    // Storm's D is the only Mid with a week card, so the Mid crown is his
    // however big Ember's season number is; Top has none, so its best
    // printed card takes it.
    const plan = planSendoff(cards, fixtures, WEEK, weekCards);

    expect(plan.cards.filter((c) => c.standout).map((c) => c.slug).sort()).toEqual(["c", "d"]);
    expect(plan.cards.find((c) => c.slug === "a")?.standout).toBe(false);
    expect(plan.cards.find((c) => c.slug === "b")?.standout).toBe(false);
  });

  it("does not crown a send-off for its season on the night it went out", () => {
    // The owner's complaint, end to end: the mid who lost in the gauntlet
    // has the bigger card (90 over 68) and the worse week (40 over 68).
    const plan = planSendoff(
      [
        card({ slug: "fallen", name: "Fallen", teamName: "Ember", role: "Mid", overall: 90 }),
        card({ slug: "through", name: "Through", teamName: "Storm", role: "Mid", overall: 55 }),
      ],
      fixtures,
      WEEK,
      [
        card({ slug: "fallen", name: "Fallen", teamName: "Ember", role: "Mid", overall: 40 }),
        card({ slug: "through", name: "Through", teamName: "Storm", role: "Mid", overall: 68 }),
      ],
    );

    expect(plan.cards.find((c) => c.slug === "through")).toMatchObject({ standout: true, overall: 68 });
    expect(plan.cards.find((c) => c.slug === "fallen")).toMatchObject({ standout: false, overall: 90 });
  });

  it("reports a team no card matched, the fallen in the season build and the teams through in the week's", () => {
    const plan = planSendoff([card({ teamName: "Storm" })], fixtures, WEEK, weekCards);

    expect(plan.cards.map((c) => c.slug)).toEqual(["d"]);
    expect(plan.unmatched).toEqual(["Ember"]);
    // A season card for Storm is not what prints it any more: with no week
    // card, the team that went through is unmatched however the season
    // build spells it.
    expect(planSendoff(cards, fixtures, WEEK, []).unmatched).toEqual(["Storm"]);
    expect(planSendoff([card({ teamName: "Ember" })], fixtures, WEEK, weekCards).unmatched).toEqual([]);
  });

  it("prints nobody plain in the finals week: the winner is the Champion send-off", () => {
    const plan = planSendoff(cards, [fx("finals", "Storm", "Ember", 3, 0, MONDAY_8PM)], WEEK, weekCards);

    expect(plan.advancing).toEqual([]);
    expect(plan.cards.every((c) => Boolean(c.sendoff))).toBe(true);
    // Season-rated like every other send-off, though a week card for the
    // same player was on hand.
    expect(plan.cards.find((c) => c.slug === "d")).toMatchObject({ overall: 95, sendoff: { stage: "champion" } });
  });

  it("does not count a gauntlet team through when the same night knocked it out", () => {
    const night = [
      fx("gauntlet_r1", "Storm", "Ember", 1, 0, MONDAY_8PM),
      fx("gauntlet_r2", "Storm", "Kite", 0, 2, MONDAY_8PM),
    ];
    expect(advancingInWeek(night, WEEK)).toEqual(["Kite"]);
    const plan = planSendoff(cards, night, WEEK, weekCards);
    // Storm prints its send-off off the season build, not its week card.
    expect(plan.cards.find((c) => c.slug === "d")).toMatchObject({ overall: 95, sendoff: { stage: "gauntlet" } });
    expect(plan.advancing).toEqual(["Kite"]);
  });

  it("prints the send-off on its playoff run and the team through on its own card", () => {
    // The whole point of the change, end to end: the fallen card's record
    // line is the bracket, the advancing card is untouched.
    const plan = planSendoff(
      [recorded({ slug: "a", name: "A", teamName: "Ember", role: "Mid" })],
      fixtures,
      WEEK,
      [recorded({ slug: "d", name: "D", teamName: "Storm", role: "Top", wins: 1, losses: 0, winratePct: 100 })],
    );

    expect(plan.cards.find((c) => c.slug === "a")).toMatchObject({ wins: 1, losses: 2, winratePct: 33.3 });
    expect(plan.cards.find((c) => c.slug === "d")).toMatchObject({ wins: 1, losses: 0, winratePct: 100 });
  });

  it("carries the week's exits for the edition label", () => {
    expect(planSendoff(cards, fixtures, WEEK, weekCards).exits).toEqual(["quarterfinals"]);
    expect(sendoffWeekLabel(planSendoff(cards, fixtures, WEEK, weekCards).exits)).toBe("Send-off · Quarterfinals");
  });

  it("plans an empty edition for a week whose fixtures are undecided", () => {
    const plan = planSendoff(cards, [fx("finals", "Storm", "Ember", null, null, MONDAY_8PM)], WEEK, weekCards);

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

/** The stamp itself is not what these assert; only the record line is. */
const MARK = { stage: "finalist", exit: "finals", team: "Ember", series: "1–3", week: WEEK } as const;

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

  it("prints the playoff run as the record line, not the season's", () => {
    // 3-2 beside a GAUNTLET stamp reads as a series score nobody played.
    const out = withSendoff(recorded(), MARK);

    expect([out.wins, out.losses]).toEqual([1, 2]);
    // One decimal, the precision winrate_pct carries everywhere else.
    expect(out.winratePct).toBe(33.3);
    // The rating is the season's: the cohort that rates a finalist honestly.
    expect(out.overall).toBe(80);
    // Games played this season — the card's level is not a playoff count.
    expect(out.level).toBe(10);
  });

  it("leaves the season's record alone when no playoff run is attached", () => {
    const out = withSendoff(recorded({ playoffs: null }), MARK);

    expect([out.wins, out.losses, out.winratePct]).toEqual([8, 2, 80]);
  });

  it("reads a winless run as 0%, not NaN", () => {
    const out = withSendoff(recorded({ playoffs: { wins: 0, losses: 2 } }), MARK);

    expect([out.wins, out.losses, out.winratePct]).toEqual([0, 2, 0]);
  });

  it("crowns the best card in each role, best first, with no week to judge on", () => {
    const crowned = crownSendoff([
      card({ slug: "low-mid", role: "Mid", overall: 70 }),
      card({ slug: "top", role: "Top", overall: 65 }),
      card({ slug: "high-mid", role: "Mid", overall: 90 }),
    ]);

    expect(crowned.map((c) => c.slug)).toEqual(["high-mid", "low-mid", "top"]);
    expect(crowned.filter((c) => c.standout).map((c) => c.slug)).toEqual(["high-mid", "top"]);
  });

  it("crowns the best WEEK, not the best card: a send-off loses to the week's mid", () => {
    // The bug this rule exists for. The send-off is rated on the season, so
    // its 90 has nothing to do with the night it went out (a week card of
    // 40); the mid who actually played the better week takes the crown.
    const crowned = crownSendoff(
      [
        card({ slug: "fallen", name: "Fallen", role: "Mid", overall: 90 }),
        card({ slug: "through", name: "Through", role: "Mid", overall: 68 }),
      ],
      [
        card({ slug: "fallen", name: "Fallen", role: "Mid", overall: 40 }),
        card({ slug: "through", name: "Through", role: "Mid", overall: 68 }),
      ],
    );

    expect(crowned.find((c) => c.slug === "through")?.standout).toBe(true);
    expect(crowned.find((c) => c.slug === "fallen")?.standout).toBe(false);
    // Print order is still the printed rating, best first.
    expect(crowned.map((c) => c.slug)).toEqual(["fallen", "through"]);
  });

  it("crowns the send-off when the fallen player had the better week", () => {
    // The crown lands on the card that PRINTS, send-off or week card: the
    // week card that judged it is not in the edition at all.
    const crowned = crownSendoff(
      [
        card({ slug: "fallen", name: "Fallen", role: "Mid", overall: 90 }),
        card({ slug: "through", name: "Through", role: "Mid", overall: 68 }),
      ],
      [
        card({ slug: "fallen", name: "Fallen", role: "Mid", overall: 75 }),
        card({ slug: "through", name: "Through", role: "Mid", overall: 68 }),
      ],
    );

    expect(crowned.find((c) => c.slug === "fallen")).toMatchObject({ standout: true, overall: 90 });
    expect(crowned.find((c) => c.slug === "through")?.standout).toBe(false);
  });

  it("ignores a week card whose player does not print", () => {
    // A crown on someone the edition never prints lands nowhere, so the
    // role is judged among the week cards that did print.
    const crowned = crownSendoff(
      [card({ slug: "printed", name: "Printed", role: "Mid", overall: 70 })],
      [
        card({ slug: "printed", name: "Printed", role: "Mid", overall: 50 }),
        card({ slug: "benched", name: "Benched", role: "Mid", overall: 99 }),
      ],
    );

    expect(crowned.map((c) => [c.slug, c.standout])).toEqual([["printed", true]]);
  });

  it("falls back to the best printed card in a role with no week card", () => {
    const crowned = crownSendoff(
      [
        card({ slug: "top-a", name: "A", role: "Top", overall: 80 }),
        card({ slug: "top-b", name: "B", role: "Top", overall: 60 }),
        card({ slug: "mid", name: "M", role: "Mid", overall: 70 }),
      ],
      [card({ slug: "mid", name: "M", role: "Mid", overall: 30 })],
    );

    expect(crowned.filter((c) => c.standout).map((c) => c.slug).sort()).toEqual(["mid", "top-a"]);
  });
});

// The bracket's later weeks, for the live-surface helpers.
const NEXT_WEEK = "2026-09-14";
const NEXT_WEEK_8PM = "2026-09-15T00:00:00.000Z"; // Monday 2026-09-14 ET
const FINALS_8PM = "2026-09-22T00:00:00.000Z"; // Monday 2026-09-21 ET

describe("eliminationsSoFar", () => {
  it("collects every fallen team across the bracket's weeks, later exits winning", () => {
    const fixtures = [
      fx("gauntlet_r1", "Alpha", "Bravo", 0, 1, MONDAY_8PM),
      fx("gauntlet_r2", "Bravo", "Charlie", 2, 1, MONDAY_8PM),
      fx("quarterfinals", "Bravo", "Delta", 3, 1, NEXT_WEEK_8PM),
      fx("finals", "Echo", "Foxtrot", 3, 2, FINALS_8PM),
    ];
    const out = eliminationsSoFar(fixtures);
    expect(out.map((e) => [e.team, e.stage, e.week])).toEqual([
      ["Alpha", "gauntlet", WEEK],
      ["Charlie", "gauntlet", WEEK],
      ["Delta", "quarterfinalist", "2026-09-14"],
      ["Foxtrot", "finalist", "2026-09-21"],
      ["Echo", "champion", "2026-09-21"],
    ]);
  });

  it("is empty while nothing in the bracket is decided", () => {
    expect(eliminationsSoFar([fx("quarterfinals", "Alpha", "Bravo", null, null, MONDAY_8PM)])).toEqual([]);
    expect(eliminationsSoFar([fx("week_5", "Alpha", "Bravo", 2, 0, MONDAY_8PM)])).toEqual([]);
  });
});

describe("stampSendoffs", () => {
  const fixtures = [fx("gauntlet_r1", "Alpha", "Bravo", 0, 1, MONDAY_8PM)];

  it("stamps the fallen team's cards and leaves everyone still in it alone", () => {
    const out = stampSendoffs(
      [card({ slug: "a", teamName: "alpha " }), card({ slug: "b", teamName: "Bravo" })],
      fixtures,
    );
    expect(out[0].sendoff).toMatchObject({ stage: "gauntlet", exit: "gauntlet_r1", team: "Alpha", week: WEEK });
    expect(out[1].sendoff).toBeUndefined();
  });

  it("swaps the fallen team's record line for its playoff run", () => {
    const out = stampSendoffs([recorded({ slug: "a", teamName: "Alpha" }), recorded({ slug: "b", teamName: "Bravo" })], fixtures);

    expect(out[0]).toMatchObject({ wins: 1, losses: 2, winratePct: 33.3 });
    // Bravo is still in it: an ordinary season card, season record.
    expect(out[1]).toMatchObject({ wins: 8, losses: 2, winratePct: 80 });
  });

  it("keeps the season crown where it is", () => {
    const out = stampSendoffs([card({ slug: "a", teamName: "Alpha", standout: true })], fixtures);
    expect(out[0].standout).toBe(true);
    expect(out[0].sendoff?.stage).toBe("gauntlet");
  });

  it("returns the cards untouched when nothing has been decided", () => {
    const cards = [card({ slug: "a", teamName: "Alpha" })];
    expect(stampSendoffs(cards, [fx("quarterfinals", "Alpha", "Bravo", null, null, MONDAY_8PM)])).toBe(cards);
  });
});

describe("weekRoster", () => {
  /** The season build: what a fallen team's cards print from. */
  const seasonCards = [
    card({ slug: "a", name: "A", teamName: "Alpha", role: "Mid", overall: 90, standout: true }),
    card({ slug: "b", name: "B", teamName: "bravo", role: "Mid", overall: 95 }),
    card({ slug: "c", name: "C", teamName: "Charlie", role: "Top", overall: 80, standout: true }),
  ];
  /** The week build: the same people, rated on the week they just played. */
  const weekCards = [
    card({ slug: "a", name: "A", teamName: "Alpha", role: "Mid", overall: 40, standout: true }),
    card({ slug: "b", name: "B", teamName: "bravo", role: "Mid", overall: 50 }),
    card({ slug: "c", name: "C", teamName: "Charlie", role: "Top", overall: 60, standout: true }),
  ];

  it("shows the fallen season-rated and stamped, and everyone still in on the week", () => {
    const out = weekRoster(seasonCards, weekCards, [fx("quarterfinals", "Alpha", "Bravo", 0, 2, MONDAY_8PM)], WEEK);

    expect(out.map((c) => c.slug).sort()).toEqual(["a", "b", "c"]);
    // Alpha's split ended: the season card, wearing its send-off.
    expect(out.find((c) => c.slug === "a")?.overall).toBe(90);
    expect(out.find((c) => c.slug === "a")?.sendoff).toMatchObject({
      stage: "quarterfinalist",
      exit: "quarterfinals",
      team: "Alpha",
      series: "0–2",
      week: WEEK,
    });
    // Bravo won and Charlie is elsewhere in the bracket: the week's own
    // cards, unstamped.
    expect(out.find((c) => c.slug === "b")?.overall).toBe(50);
    expect(out.find((c) => c.slug === "b")?.sendoff).toBeUndefined();
    expect(out.find((c) => c.slug === "c")?.overall).toBe(60);
    expect(out.find((c) => c.slug === "c")?.sendoff).toBeUndefined();
  });

  it("swaps the fallen team's record line for its playoff run, and leaves the week's cards alone", () => {
    const out = weekRoster(
      [recorded({ slug: "a", teamName: "Alpha", role: "Mid" }), recorded({ slug: "b", teamName: "bravo", role: "Top" })],
      [recorded({ slug: "b", teamName: "bravo", role: "Top", wins: 2, losses: 0, winratePct: 100 })],
      [fx("quarterfinals", "Alpha", "Bravo", 0, 2, MONDAY_8PM)],
      WEEK,
    );

    expect(out.find((c) => c.slug === "a")).toMatchObject({ wins: 1, losses: 2, winratePct: 33.3 });
    // Bravo went through: its week card, printing the week it just played.
    expect(out.find((c) => c.slug === "b")).toMatchObject({ wins: 2, losses: 0, winratePct: 100 });
  });

  it("leaves a team that fell in an earlier week off the roster", () => {
    // Its send-off printed that week; this week's fixtures do not name it,
    // and it has no week card because it did not play.
    const fixtures = [
      fx("quarterfinals", "Alpha", "Bravo", 0, 2, MONDAY_8PM),
      fx("semifinals", "Bravo", "Charlie", null, null, NEXT_WEEK_8PM),
    ];
    const out = weekRoster(seasonCards, [weekCards[1], weekCards[2]], fixtures, NEXT_WEEK);

    expect(out.map((c) => c.slug).sort()).toEqual(["b", "c"]);
    expect(out.every((c) => c.sendoff === undefined)).toBe(true);
  });

  it("crowns per role on the week both builds played", () => {
    const out = weekRoster(seasonCards, weekCards, [fx("quarterfinals", "Alpha", "Bravo", 0, 2, MONDAY_8PM)], WEEK);

    // Alpha's send-off is rated 90 on the season and 40 on the night it
    // went out, so Mid goes to Bravo's 50; Charlie is the only Top.
    expect(out.find((c) => c.slug === "a")?.standout).toBe(false);
    expect(out.find((c) => c.slug === "b")?.standout).toBe(true);
    expect(out.find((c) => c.slug === "c")?.standout).toBe(true);
  });

  it("gives Card of the Week to the mid who won, not the mid who went out", () => {
    // Same complaint as the edition's, on the surfaces Browse and the hub
    // read: the printed send-off still shows its season 90, uncrowned.
    const out = weekRoster(
      [
        card({ slug: "fallen", name: "Fallen", teamName: "Alpha", role: "Mid", overall: 90 }),
        card({ slug: "through", name: "Through", teamName: "bravo", role: "Mid", overall: 55 }),
      ],
      [
        card({ slug: "fallen", name: "Fallen", teamName: "Alpha", role: "Mid", overall: 40 }),
        card({ slug: "through", name: "Through", teamName: "bravo", role: "Mid", overall: 68 }),
      ],
      [fx("quarterfinals", "Alpha", "Bravo", 0, 2, MONDAY_8PM)],
      WEEK,
    );

    expect(out.find((c) => c.slug === "through")).toMatchObject({ standout: true, overall: 68 });
    expect(out.find((c) => c.slug === "fallen")).toMatchObject({ standout: false, overall: 90 });
  });

  it("is the week's cards, crowned, for a week with no exit fixture", () => {
    const out = weekRoster(seasonCards, weekCards, [fx("week_5", "Alpha", "Bravo", 2, 0, MONDAY_8PM)], WEEK);

    expect(out.map((c) => c.slug).sort()).toEqual(["a", "b", "c"]);
    expect(out.every((c) => c.sendoff === undefined)).toBe(true);
    expect(out.filter((c) => c.standout).map((c) => c.slug).sort()).toEqual(["b", "c"]);
  });
});

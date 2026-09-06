import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import type { InventoryRow } from "@/lib/packs/queries";
import { briefFor, shineOf } from "@/lib/expeditions/config";
import type { ConvoyView, ExpeditionRun, Grave, LostHold } from "@/lib/expeditions/queries";
import ExpeditionBoard from "./ExpeditionBoard";

/** A route that changed nothing: every card home, no forks pushed. */
const QUIET_ROUTE = (ids: number[]) => ({
  lootMultiplier: 1,
  pushes: 0,
  silences: 0,
  fates: ids.map((id) => ({ id, fate: "home" as const, mutation: null, woundedUntil: null })),
  fragments: 0,
  rescued: null,
  cleansed: null,
      surge: [],
      echo: null,
  events: [],
});

// The two server actions. "use server" modules pull in server-only
// transitively (runs.ts), so jsdom can't load the real one at all — and the
// board's whole job here is what it does with the results.
const { launchExpeditionAction, claimExpeditionAction, decideForkAction, ransomLostCardAction } = vi.hoisted(() => ({
  launchExpeditionAction: vi.fn(),
  claimExpeditionAction: vi.fn(),
  decideForkAction: vi.fn(),
  ransomLostCardAction: vi.fn(),
}));
vi.mock("@/lib/expeditions/actions", () => ({
  launchExpeditionAction,
  claimExpeditionAction,
  decideForkAction,
  ransomLostCardAction,
}));

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

/** The Eastern day the board is pinned to in these tests. Its brief is
 *  looked up rather than spelled out — briefFor owns that mapping. */
const TODAY = "2026-08-27";
const BRIEF = briefFor(TODAY);

function makeCard(name: string, role: string): PlayerCardData {
  return {
    slug: name.toLowerCase(),
    name,
    tag: "NA1",
    teamName: null,
    teamImageUrl: null,
    role,
    overall: 80,
    tier: { key: "gold", label: "Gold" },
    archetype: "Playmaker",
    signature: null,
    artSkin: 0,
    autograph: null,
    motto: null,
    serial: 0,
    collectionSize: 48,
    topChampions: [],
    form: [],
    subStats: [{ key: "combat", label: "Combat", value: 50 }],
    highlights: [],
    badges: [],
    standout: false,
    wins: 1,
    losses: 1,
    winratePct: 50,
    level: 10,
    pentas: 0,
    season: "S5",
  };
}

function makeCopy(
  id: number,
  playerName: string,
  tier: string,
  extra: Partial<InventoryRow> = {},
): InventoryRow {
  const role = extra.role ?? "Mid";
  return {
    id,
    season: "S5",
    slug: playerName.toLowerCase(),
    playerName,
    role,
    editionWeek: "2026-08-24",
    overall: 80,
    tier,
    foil: false,
    foilType: null,
    signed: false,
    card: makeCard(playerName, role),
    packOpenId: null,
    acquiredAt: "2026-08-25T00:00:00.000Z",
    printNumber: null,
    mutation: null,
    ...extra,
  };
}

// shineOf: tier ladder index + 1, plus the foil parallel, plus 4 for ink.
// Alba 3 (gold), Bex 2 (silver), Cyn 7 (diamond 6 + prisma 1),
// Dov 16 (challenger 8 + ice 4 + signed 4), Eve 1 (bronze) — and Eve is the
// one that's already out.
const COPIES: InventoryRow[] = [
  makeCopy(1, "Alba", "gold", { role: "Mid" }),
  makeCopy(2, "Bex", "silver", { role: "Top" }),
  makeCopy(3, "Cyn", "diamond", { foil: true, foilType: "prisma", role: "Jungle" }),
  makeCopy(4, "Dov", "challenger", { foil: true, foilType: "ice", signed: true, role: "Support" }),
  makeCopy(5, "Eve", "bronze", { role: "Bot" }),
];

const HOUR = 60 * 60 * 1000;

/** The zone this process runs in, captured before any test moves it.
 *  `delete process.env.TZ` does NOT put Node back on the system zone, so
 *  the field-log case restores by naming the zone rather than by unsetting
 *  the variable. */
const AMBIENT_TZ = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

function makeRun(over: Partial<ExpeditionRun> & { id: number }): ExpeditionRun {
  return {
    tier: "raid",
    squad: [5, 1, 2],
    shine: 12,
    // Noon Eastern on TODAY, fixed rather than relative: the ceremony names
    // the brief of the day the run LAUNCHED, and a `Date.now() - 3h` would
    // make that assertion depend on what time the suite happens to run.
    startedAt: "2026-08-27T16:00:00.000Z",
    resolvesAt: new Date(Date.now() + 1.5 * HOUR).toISOString(),
    outcome: null,
    claimedAt: null,
    forks: 0,
    choices: [],
    insured: false,
    target: null,
    fee: 0,
    encounters: [],
    rules: 2,
    convoy: null,
    ...over,
  };
}

function renderBoard(
  over: {
    runs?: ExpeditionRun[];
    deployedIds?: Set<number>;
    copies?: InventoryRow[];
    holds?: LostHold[];
    graves?: Grave[];
    fragments?: number;
    patron?: boolean;
    policyUsed?: boolean;
    playingToday?: string[];
    rivals?: Record<number, string>;
    convoys?: Record<number, ConvoyView>;
  } = {},
) {
  return render(
    <ExpeditionBoard
      convoys={over.convoys}
      playingToday={over.playingToday}
      rivals={over.rivals}
      copies={over.copies ?? COPIES}
      runs={over.runs ?? []}
      deployedIds={over.deployedIds ?? new Set([5])}
      today={TODAY}
      holds={over.holds}
      graves={over.graves}
      fragments={over.fragments}
      patron={over.patron}
      policyUsed={over.policyUsed}
    />,
  );
}

/** Pick a copy by the accessible name its chip carries. */
function pick(playerName: string, shine: number) {
  fireEvent.click(screen.getByRole("button", { name: `${playerName} — ${shine} shine` }));
}

/** Alba + Bex + Cyn: 12 shine, one foil, no ink — clears Deep Raid exactly
 *  and misses all three of Legend Hunt's gates. */
function pickTwelveShineSquad() {
  pick("Alba", 3);
  pick("Bex", 2);
  pick("Cyn", 7);
}

async function click(button: HTMLElement) {
  await act(async () => {
    fireEvent.click(button);
  });
}

beforeEach(() => {
  launchExpeditionAction.mockReset().mockResolvedValue({ ok: true, runId: 99, resolvesAt: "2026-08-28T00:00:00.000Z", fee: 0, freePolicy: false });
  claimExpeditionAction.mockReset().mockResolvedValue({
    ok: true,
    outcome: { grade: "solid", dollars: 180, comp: true, mark: "sigil", briefHit: true },
    route: QUIET_ROUTE([5, 1, 2]),
    baseDollars: 180,
    merchant: 0,
    stranded: null,
    surge: [],
    echo: null,
    bearerId: 1,
    balance: 5000,
    fragments: 0,
  });
  decideForkAction.mockReset().mockResolvedValue({ ok: true, closesAt: "2026-08-28T00:00:00.000Z" });
  ransomLostCardAction.mockReset().mockResolvedValue({ ok: true, balance: 900, paid: 340 });
  refresh.mockReset();
});

afterEach(cleanup);

describe("ExpeditionBoard — the day's brief", () => {
  it("posts today's brief with what fielding it is worth", () => {
    renderBoard();

    expect(screen.getByText(`${BRIEF.label} — +20% yield`)).toBeTruthy();
  });

  it("names the role the brief actually asks for", () => {
    renderBoard();

    // "Jungle" for 2026-08-27 — the label alone doesn't say which card to
    // swap in, which is the only decision the brief drives.
    expect(screen.getByTestId("expedition-brief").textContent).toContain(BRIEF.role);
  });
});

describe("ExpeditionBoard — tier cards", () => {
  it("prints each tier's entry requirements and duration", () => {
    renderBoard();

    const raid = screen.getByTestId("tier-raid");
    expect(within(raid).getByText("Deep Raid")).toBeTruthy();
    expect(within(raid).getByText("12 shine · 1 foil")).toBeTruthy();
    expect(within(raid).getByText("24 hours away · 2 forks")).toBeTruthy();

    const legend = screen.getByTestId("tier-legend");
    expect(within(legend).getByText("20 shine · 2 foils · 1 signed")).toBeTruthy();
    expect(within(legend).getByText("48 hours away · 3 forks")).toBeTruthy();

    // The ungated tier says so rather than showing an empty line.
    expect(within(screen.getByTestId("tier-scout")).getByText("Anyone can run it")).toBeTruthy();
  });

  it("disables a tier the selection can't field, listing every unmet reason", () => {
    renderBoard();
    pickTwelveShineSquad();

    const legend = screen.getByTestId("tier-legend");
    // Verbatim from squadMeets — the board must not restate the gates in
    // its own words, or the two drift.
    expect(within(legend).getByText("Legend Hunt needs 2 foil cards — this squad has 1.")).toBeTruthy();
    expect(within(legend).getByText("Legend Hunt needs 1 signed card — this squad has 0.")).toBeTruthy();
    expect(within(legend).getByText("Legend Hunt needs 20 shine — this squad has 12.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Launch Legend Hunt" }) as HTMLButtonElement).disabled).toBe(true);

    // The same squad clears Deep Raid on the nose: 12 shine, one foil.
    expect((screen.getByRole("button", { name: "Launch Deep Raid" }) as HTMLButtonElement).disabled).toBe(false);
    expect(within(screen.getByTestId("tier-raid")).queryByRole("listitem")).toBeNull();
  });

  it("shuts a tier whose run is still in the field, and leaves the others open", () => {
    // One of each at a time: launch_expedition raises `tier already out`,
    // and the board has to say so before the click rather than after it.
    renderBoard({ runs: [makeRun({ id: 30, tier: "legend", squad: [9, 8, 7] })] });
    pickTwelveShineSquad();

    const legend = screen.getByTestId("tier-legend");
    expect(within(legend).getByText(/One Legend Hunt at a time/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Launch Legend Hunt" }) as HTMLButtonElement).disabled).toBe(true);

    // The raid slot is untouched — a tier is a slot, not a lock on the board.
    expect((screen.getByRole("button", { name: "Launch Deep Raid" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId("tier-raid-out")).toBeNull();
  });

  it("reopens a tier once its run has been claimed", () => {
    renderBoard({
      runs: [makeRun({ id: 31, tier: "raid", squad: [9, 8, 7], claimedAt: new Date().toISOString() })],
    });
    pickTwelveShineSquad();

    expect(screen.queryByTestId("tier-raid-out")).toBeNull();
    expect((screen.getByRole("button", { name: "Launch Deep Raid" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("holds every tier shut until three cards are picked", () => {
    renderBoard();
    pick("Alba", 3);

    expect((screen.getByRole("button", { name: "Launch Scouting Run" }) as HTMLButtonElement).disabled).toBe(true);
    expect(
      within(screen.getByTestId("tier-scout")).getByText(
        "An expedition takes exactly 3 cards — this squad has 1.",
      ),
    ).toBeTruthy();
  });

  it("launches the chosen tier with the chosen squad", async () => {
    renderBoard();
    pickTwelveShineSquad();

    await click(screen.getByRole("button", { name: "Launch Deep Raid" }));

    expect(launchExpeditionAction).toHaveBeenCalledTimes(1);
    expect(launchExpeditionAction).toHaveBeenCalledWith("raid", [1, 2, 3], { insured: false, target: null, convoy: null });
    expect(refresh).toHaveBeenCalledTimes(1);
    // The squad went out — the picker is empty again rather than still
    // offering the three cards that just left.
    expect(screen.getByTestId("squad-shine").textContent).toContain("0");
  });

  it("surfaces a refused launch and doesn't refresh", async () => {
    launchExpeditionAction.mockResolvedValue({ ok: false, error: "One of those cards is already out on an expedition." });
    renderBoard();
    pickTwelveShineSquad();

    await click(screen.getByRole("button", { name: "Launch Deep Raid" }));

    expect(screen.getByText("One of those cards is already out on an expedition.")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("ExpeditionBoard — the squad picker", () => {
  it("totals the selection's shine as the sum of shineOf", () => {
    renderBoard();
    pickTwelveShineSquad();

    const expected = shineOf(COPIES[0]) + shineOf(COPIES[1]) + shineOf(COPIES[2]);
    expect(expected).toBe(12);
    expect(screen.getByTestId("squad-shine").textContent).toContain(String(expected));
  });

  it("chips every copy with what it is worth", () => {
    renderBoard();

    expect(screen.getByText("+7")).toBeTruthy();
    expect(screen.getByText("+16")).toBeTruthy();
  });

  it("locks copies that are already out and says why", () => {
    renderBoard();

    const eve = screen.getByRole("button", { name: "Eve — 1 shine" }) as HTMLButtonElement;
    expect(eve.disabled).toBe(true);
    expect(eve.title).toBe("On expedition.");

    fireEvent.click(eve);
    expect(screen.getByTestId("squad-shine").textContent).toContain("0");
  });

  it("takes three and no more", () => {
    renderBoard();
    pickTwelveShineSquad();

    const dov = screen.getByRole("button", { name: "Dov — 16 shine" }) as HTMLButtonElement;
    expect(dov.disabled).toBe(true);

    // Dropping one frees the slot again.
    pick("Bex", 2);
    expect((screen.getByRole("button", { name: "Dov — 16 shine" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("ExpeditionBoard — runs in the field", () => {
  it("counts a squad that is still out down, with no way to claim it", () => {
    renderBoard({ runs: [makeRun({ id: 20 })], deployedIds: new Set([5, 1, 2]) });

    const run = screen.getByTestId("run-20");
    // The fixture resolves at exactly +1h30m, so whether this reads 30m or
    // 29m depends on how many microseconds passed between building the run
    // and rendering it. The assertion is "it counts down from about an hour
    // and a half", not "the machine was slow".
    expect(within(run).getByText(/Back in 1h (28|29|30)m/)).toBeTruthy();
    expect(within(run).queryByRole("button", { name: /^Claim/ })).toBeNull();
    expect(within(run).getByText("Deep Raid")).toBeTruthy();
  });

  it("offers the claim once the squad is due back", () => {
    renderBoard({
      runs: [makeRun({ id: 21, resolvesAt: new Date(Date.now() - HOUR).toISOString() })],
      deployedIds: new Set([5, 1, 2]),
    });

    expect(screen.getByRole("button", { name: "Claim the Deep Raid" })).toBeTruthy();
    expect(within(screen.getByTestId("run-21")).queryByText(/Back in/)).toBeNull();
  });

  it("shows who went out on a run", () => {
    renderBoard({ runs: [makeRun({ id: 20 })], deployedIds: new Set([5, 1, 2]) });

    const run = screen.getByTestId("run-20");
    for (const name of ["Eve", "Alba", "Bex"]) {
      expect(within(run).getByText(name)).toBeTruthy();
    }
  });

  it("draws the route under a run and keeps its trail journal, folded to the latest lines", () => {
    // Nine hours into a 24h raid with two forks: the first leg's two trail
    // lines and the arrival at fork 1 are all in the past, so the journal
    // has three lines to show and nothing yet to fold.
    renderBoard({
      runs: [
        makeRun({
          id: 23,
          forks: 2,
          startedAt: new Date(Date.now() - 9 * HOUR).toISOString(),
          resolvesAt: new Date(Date.now() + 15 * HOUR).toISOString(),
        }),
      ],
      deployedIds: new Set([5, 1, 2]),
    });

    const run = screen.getByTestId("run-23");
    expect(within(run).getByTestId("route-map")).toBeTruthy();
    const journal = within(run).getByTestId("journal-23");
    expect(within(journal).getAllByRole("listitem").length).toBeGreaterThanOrEqual(3);
    expect(journal.textContent).toContain("The squad reached the reactor.");
    expect(within(run).queryByText(/just set out/)).toBeNull();
  });

  it("says the squad has just set out before the trail has anything to report", () => {
    renderBoard({
      runs: [makeRun({ id: 24, startedAt: new Date().toISOString(), resolvesAt: new Date(Date.now() + 24 * HOUR).toISOString() })],
      deployedIds: new Set([5, 1, 2]),
    });

    const run = screen.getByTestId("run-24");
    expect(within(run).getByText(/The squad has just set out/)).toBeTruthy();
    expect(within(run).queryByTestId("journal-24")).toBeNull();
  });

  it("shows art for every kind of print that can march, not just player cards", () => {
    // A champions relic names its champion on champWin and a moment names
    // it on moment — neither carries a `signature`. Reading only the
    // signature rendered both as a "?" box in the squad strip.
    const marching: InventoryRow[] = [
      makeCopy(1, "Alba", "gold", {
        card: { ...makeCard("Alba", "Mid"), signature: { champion: "Ahri", games: 9 } },
      }),
      makeCopy(2, "the fool", "challenger", {
        card: {
          ...makeCard("the fool", "Mid"),
          champWin: {
            rank: "JOKER",
            setIndex: 5,
            setSize: 6,
            team: "Faceless",
            seasonWon: "S4",
            champion: "Xin Zhao",
            joker: true,
          },
        },
      }),
      makeCopy(3, "Cyn", "diamond", {
        card: {
          ...makeCard("Cyn", "Jungle"),
          moment: {
            id: 7,
            title: "ONE MAN ARMY",
            headline: "40% of the damage",
            summonerName: "Cyn",
            champion: "Yasuo",
            teamName: null,
            weekStart: "2026-08-24",
            playerSlug: "cyn",
          },
        },
      }),
    ];

    renderBoard({
      copies: marching,
      runs: [makeRun({ id: 22, squad: [1, 2, 3] })],
      deployedIds: new Set([1, 2, 3]),
    });

    const run = screen.getByTestId("run-22");
    const art = run.querySelectorAll("img");
    expect(art).toHaveLength(3);
    expect(within(run).queryByText("?")).toBeNull();
    const sources = [...art].map((image) => image.getAttribute("src") ?? "");
    expect(sources.some((src) => /XinZhao/i.test(src))).toBe(true);
    expect(sources.some((src) => /Ahri/i.test(src))).toBe(true);
    expect(sources.some((src) => /Yasuo/i.test(src))).toBe(true);
  });
});

describe("ExpeditionBoard — the field log", () => {
  // 10pm Eastern on 1 September, which is already the 2nd in UTC. A log
  // that formats without a timeZone prints the SERVER's day into the HTML
  // and the VIEWER's day after hydration — a React mismatch, and the wrong
  // date, for every run launched between midnight and 4am UTC.
  const LATE_ON_THE_FIRST = "2026-09-02T02:00:00.000Z";

  function finishedRun() {
    return makeRun({
      id: 30,
      startedAt: LATE_ON_THE_FIRST,
      resolvesAt: "2026-09-02T10:00:00.000Z",
      claimedAt: "2026-09-02T10:30:00.000Z",
      outcome: {
        grade: "solid", dollars: 120, comp: false, mark: null, bearer: null,
        lootMultiplier: 1, pushes: 0, fragments: 0, fates: [], events: [], rescued: null, cleansed: null,
      surge: [],
      echo: null,
      },
    });
  }

  afterEach(() => {
    process.env.TZ = AMBIENT_TZ;
  });

  it("dates a finished run on the Eastern calendar, not on the renderer's zone", () => {
    // Rendered from a UTC box — the server's situation. Without the fix the
    // log reads "Sep 2" here and "Sep 1" in an Eastern browser.
    process.env.TZ = "UTC";
    expect(new Date(LATE_ON_THE_FIRST).toLocaleDateString("en-US", { month: "short", day: "numeric" }))
      .toBe("Sep 2");

    renderBoard({ runs: [finishedRun()] });

    const log = screen.getByRole("region", { name: "Finished expeditions" });
    expect(within(log).getByText("Sep 1")).toBeTruthy();
  });

  it("reads the same date from an Eastern browser, so hydration agrees", () => {
    process.env.TZ = "America/New_York";

    renderBoard({ runs: [finishedRun()] });

    const log = screen.getByRole("region", { name: "Finished expeditions" });
    expect(within(log).getByText("Sep 1")).toBeTruthy();
    expect(within(log).getByText("$120")).toBeTruthy();
  });
});

describe("ExpeditionBoard — the claim ceremony", () => {
  const resolvable = () =>
    renderBoard({
      runs: [makeRun({ id: 21, resolvesAt: new Date(Date.now() - HOUR).toISOString() })],
      deployedIds: new Set([5, 1, 2]),
    });

  it("banks the payout and names the card the mark landed on", async () => {
    resolvable();

    await click(screen.getByRole("button", { name: "Claim the Deep Raid" }));

    expect(claimExpeditionAction).toHaveBeenCalledWith(21);
    const ceremony = screen.getByTestId("expedition-ceremony");
    expect(ceremony.textContent).toContain("$180");
    expect(within(ceremony).getByText("Alba — Home")).toBeTruthy();
    expect(within(ceremony).getByText(/wears the sigil mark/)).toBeTruthy();
    // Sigil, not the mark the card was already wearing (none).
    expect(within(ceremony).getByRole("img", { name: "Expedition mark — Sigil" })).toBeTruthy();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("calls out the free pack and the brief bonus when they landed", async () => {
    resolvable();

    await click(screen.getByRole("button", { name: "Claim the Deep Raid" }));

    const ceremony = screen.getByTestId("expedition-ceremony");
    expect(ceremony.textContent).toContain("free pack");
    expect(ceremony.textContent).toContain(BRIEF.label);
  });

  it("stays quiet about a mark when none dropped", async () => {
    claimExpeditionAction.mockResolvedValue({
      ok: true,
      outcome: { grade: "poor", dollars: 40, comp: false, mark: null, briefHit: false },
      route: QUIET_ROUTE([5, 1, 2]),
      baseDollars: 40,
      bearerId: null,
      balance: 1040,
      fragments: 0,
      merchant: 0,
      stranded: null,
      surge: [],
      echo: null,
    });
    resolvable();

    await click(screen.getByRole("button", { name: "Claim the Deep Raid" }));

    const ceremony = screen.getByTestId("expedition-ceremony");
    expect(ceremony.textContent).toContain("$40");
    expect(within(ceremony).queryByText(/wears the/)).toBeNull();
    expect(ceremony.textContent).not.toContain("free pack");
  });

  it("can be dismissed with the keyboard", async () => {
    resolvable();

    await click(screen.getByRole("button", { name: "Claim the Deep Raid" }));
    expect(screen.getByTestId("expedition-ceremony")).toBeTruthy();
    expect(document.activeElement?.textContent).toBe("Back to the board");

    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByTestId("expedition-ceremony")).toBeNull();
  });

  it("surfaces a refused claim, and re-reads the server so a paid run can't stick", async () => {
    claimExpeditionAction.mockResolvedValue({ ok: false, error: "That squad is still out — check back soon." });
    resolvable();

    await click(screen.getByRole("button", { name: "Claim the Deep Raid" }));

    expect(screen.getByText("That squad is still out — check back soon.")).toBeTruthy();
    expect(screen.queryByTestId("expedition-ceremony")).toBeNull();
    // No ceremony and no optimistic move to the log: the board shows what
    // the server says. The refresh is what keeps an 'already claimed'
    // refusal — the claim landed, the response was dropped — from leaving
    // a live Claim button over a run that is already paid.
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Claim the Deep Raid" })).toBeTruthy();
  });
});

describe("ExpeditionBoard — a copy the shelf named", () => {
  it("starts the squad with ?send='s copy, unless it is away", () => {
    const copies = [makeCopy(1, "Alba", "gold"), makeCopy(2, "Bex", "gold")];
    render(<ExpeditionBoard copies={copies} runs={[]} deployedIds={new Set()} today={TODAY} initialPick={2} />);
    expect(screen.getByRole("button", { name: /^Bex — / }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /^Alba — / }).getAttribute("aria-pressed")).toBe("false");
    cleanup();

    render(<ExpeditionBoard copies={copies} runs={[]} deployedIds={new Set([2])} today={TODAY} initialPick={2} />);
    expect(screen.getByRole("button", { name: /^Bex — / }).getAttribute("aria-pressed")).toBe("false");
  });
});

describe("ExpeditionBoard — the rules of the road", () => {
  it("prints every run's worst case and every mutation's consequences", () => {
    renderBoard();

    const rules = screen.getByTestId("expedition-rules");
    expect(within(rules).getByText("The rules of the road")).toBeTruthy();
    expect(within(rules).getAllByText("Cards can DIE").length).toBeGreaterThan(0);
    for (const key of ["irradiated", "hardened", "haunted", "cursed", "voidtouched"]) {
      const rule = within(rules).getByTestId(`rule-${key}`);
      expect(rule.textContent).toContain("Fantasy:");
      expect(rule.textContent).toContain("Gauntlet:");
      expect(rule.textContent).toContain("Market:");
    }
    expect(rules.textContent).toContain("Silence is safe.");
    expect(rules.textContent).toContain("Never at risk:");
  });

  it("names the picked cards in each route's consent line, and softens it with insurance", () => {
    renderBoard();
    pickTwelveShineSquad();

    expect(screen.getByTestId("consent-scout").textContent).toBe("Nothing on this run can hurt a card.");
    expect(screen.getByTestId("consent-raid").textContent).toContain("Alba, Bex, Cyn can come home wounded");
    expect(screen.getByTestId("consent-legendary").textContent).toContain("can DIE");

    fireEvent.click(screen.getByRole("checkbox", { name: /Insure this run/ }));
    expect(screen.getByTestId("consent-legendary").textContent).toContain("can be lost");
    expect(screen.getByTestId("consent-legend").textContent).toContain("wounded");
  });

  it("keeps a one-of-one off the routes that can lose it, saying which card", () => {
    const eclipse = makeCopy(6, "Fen", "challenger", { foil: true, foilType: "eclipse", signed: true, role: "Mid" });
    renderBoard({ copies: [...COPIES, eclipse] });
    pick("Fen", 16);
    pick("Dov", 16);
    pick("Cyn", 7);

    const legend = screen.getByTestId("tier-legend");
    expect(within(legend).getByText("Fen is one of one and cannot go on a route where a card can be lost.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Launch Legend Hunt" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Launch Deep Raid" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("calls a moment or a plate a relic, not a one-of-one, and keeps it off the same routes", () => {
    const moment = makeCopy(7, "Big Game", "gold", { role: "Mid", card: { moment: { id: 1 } as never } });
    renderBoard({ copies: [...COPIES, moment] });
    const chip = screen.getByText("Big Game").closest("button")!;
    expect(within(chip).getByText("relic")).toBeTruthy();
    expect(within(chip).queryByText("1/1")).toBeNull();
    pick("Big Game", 6);
    pick("Dov", 16);
    pick("Cyn", 7);

    const legend = screen.getByTestId("tier-legend");
    expect(within(legend).getByText("Big Game is a relic and cannot go on a route where a card can be lost.")).toBeTruthy();
  });

  it("holds the Legendary route behind three fragments", () => {
    renderBoard({ fragments: 1 });
    pick("Dov", 16);
    pick("Cyn", 7);
    pick("Alba", 3);

    const legendary = screen.getByTestId("tier-legendary");
    expect(within(legendary).getByText(/Needs 3 map fragments — you hold 1\./)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Launch Legendary route" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("fragments").textContent).toBe("1/3 map fragment");
  });

  it("sends the insurance and the cleanse target with the launch", async () => {
    const haunted = makeCopy(7, "Gil", "gold", {
      role: "Mid",
      card: { ...makeCard("Gil", "Mid"), mutation: { key: "haunted", date: "2026-08-20", run: 3 } },
    });
    renderBoard({ copies: [...COPIES, haunted] });
    pick("Gil", 3);
    pick("Bex", 2);
    pick("Alba", 3);
    fireEvent.click(screen.getByRole("checkbox", { name: /Insure this run/ }));

    await click(screen.getByRole("button", { name: "Launch Exorcism" }));

    // An Exorcism cannot hurt a card, so the policy is not sent with it.
    // Squad order is shelf order, not click order (the RPC doesn't care;
    // the field strip does).
    expect(launchExpeditionAction).toHaveBeenCalledWith("exorcism", [1, 2, 7], { insured: false, target: 7, convoy: null });
  });
});

describe("ExpeditionBoard — forks", () => {
  // A 24h raid launched nine hours ago: fork 1 (8h) is open until 16h.
  const atFork = () =>
    makeRun({
      id: 40,
      tier: "raid",
      squad: [5, 1, 2],
      forks: 2,
      startedAt: new Date(Date.now() - 9 * HOUR).toISOString(),
      resolvesAt: new Date(Date.now() + 15 * HOUR).toISOString(),
    });

  it("puts the open fork at the top with its story and every option's odds", () => {
    renderBoard({ runs: [atFork()], deployedIds: new Set([5, 1, 2]) });

    const fork = screen.getByTestId("fork-40-0");
    expect(within(fork).getByText("The reactor")).toBeTruthy();
    expect(within(fork).getByText("Deep Raid · fork 1 of 2")).toBeTruthy();
    const push = within(fork).getByRole("button", { name: "Go into the reactor — push" }) as HTMLButtonElement;
    expect(push.disabled).toBe(false);
    expect(push.textContent).toContain("15% a card is wounded");
    expect(push.textContent).toContain("20% to bring home irradiated");
    // No signed card in Eve/Alba/Bex: the favour is shown, locked, and says why.
    const favour = within(fork).getByRole("button", { name: "Call in a favour — favour" }) as HTMLButtonElement;
    expect(favour.disabled).toBe(true);
    expect(favour.textContent).toContain("Needs a signed card");
    expect(fork.textContent).toContain("silence camps");
  });

  it("lets a squad card speak at the fork", () => {
    renderBoard({ runs: [atFork()], deployedIds: new Set([5, 1, 2]) });

    const fork = screen.getByTestId("fork-40-0");
    const banter = within(fork).getByTestId("banter");
    // The line is seeded off the run, so it is stable — and it is one of the
    // squad talking, not the narrator: it names a card that went out.
    expect(banter.textContent).toMatch(/Eve|Alba|Bex/);
  });

  it("answers the fork through the action and refreshes", async () => {
    renderBoard({ runs: [atFork()], deployedIds: new Set([5, 1, 2]) });

    await click(screen.getByRole("button", { name: "Go into the reactor — push" }));

    expect(decideForkAction).toHaveBeenCalledWith(40, 0, "push");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows nothing to answer once the fork is decided", () => {
    renderBoard({
      runs: [makeRun({ ...atFork(), choices: [{ index: 0, choice: "camp", at: "" }] })],
      deployedIds: new Set([5, 1, 2]),
    });

    expect(screen.queryByTestId("fork-40-0")).toBeNull();
    expect(screen.queryByRole("region", { name: "Forks waiting on you" })).toBeNull();
  });
});

describe("ExpeditionBoard — missing cards", () => {
  const hold: LostHold = { holdId: 70, cardId: 4, expiresAt: new Date(Date.now() + 5 * 24 * HOUR).toISOString(), lostOn: 30, season: "S5" };

  it("lists a lost card with its ransom priced off its shine, and ransoms on the second tap", async () => {
    ransomLostCardAction.mockResolvedValue({ ok: true, balance: 900, paid: 940 });
    renderBoard({ holds: [hold], deployedIds: new Set([5, 4]) });

    const row = screen.getByTestId("hold-70");
    expect(within(row).getAllByText("Dov").length).toBeGreaterThan(0);
    // 300 + 40 x 16 shine.
    const ransom = within(row).getByRole("button", { name: "Ransom for 940" });
    fireEvent.click(ransom);
    expect(ransomLostCardAction).not.toHaveBeenCalled();
    await click(within(row).getByRole("button", { name: "Confirm — pay 940 to ransom Dov" }));
    expect(ransomLostCardAction).toHaveBeenCalledWith(70);
    expect(screen.getByTestId("expedition-notice").textContent).toContain("Dov is home, wounded, for $940");
  });

  it("locks the lost card in the picker and calls it lost, not away", () => {
    renderBoard({ holds: [hold], deployedIds: new Set([5, 4]) });

    const dov = screen.getByRole("button", { name: "Dov — 16 shine" }) as HTMLButtonElement;
    expect(dov.disabled).toBe(true);
    expect(dov.title).toBe("Lost.");
  });

  it("opens the Rescue with the hold as its target", async () => {
    renderBoard({ holds: [hold], deployedIds: new Set([5, 4]) });
    pick("Alba", 3);
    pick("Bex", 2);
    pick("Cyn", 7);

    await click(screen.getByRole("button", { name: "Launch Rescue" }));

    expect(launchExpeditionAction).toHaveBeenCalledWith("rescue", [1, 2, 3], { insured: false, target: 70, convoy: null });
  });

  it("says a Rescue has nobody to go after when nothing is lost", () => {
    renderBoard();
    pickTwelveShineSquad();

    expect(within(screen.getByTestId("tier-rescue")).getByText(/Nothing is lost/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Launch Rescue" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("ExpeditionBoard — the graveyard and a changed squad", () => {
  it("keeps the fallen on the page", () => {
    const grave: Grave = {
      id: 1, inventoryId: 99, slug: "hal", playerName: "Hal", tier: "diamond", foil: true, foilType: "ice", signed: false,
      card: makeCard("Hal", "Mid"), runId: 50, cause: "route", diedAt: "2026-08-20T12:00:00.000Z",
    };
    renderBoard({ graves: [grave] });

    const stone = screen.getByTestId("grave-1");
    expect(within(stone).getByText("Hal")).toBeTruthy();
    expect(stone.textContent).toContain("Fell on the Legendary route");
  });

  it("shows every card that came home changed, drawn with what it now wears", async () => {
    claimExpeditionAction.mockResolvedValue({
      ok: true,
      outcome: { grade: "solid", dollars: 390, comp: false, mark: null, briefHit: false },
      route: {
        ...QUIET_ROUTE([5, 1, 2]),
        lootMultiplier: 1.5,
        pushes: 2,
        fates: [
          { id: 5, fate: "home", mutation: "irradiated", woundedUntil: null },
          { id: 1, fate: "wounded", mutation: null, woundedUntil: "2026-08-30T16:00:00.000Z" },
          { id: 2, fate: "home", mutation: null, woundedUntil: null },
        ],
        events: [{ fork: 0, tone: "good", text: "The reactor: Eve came out of it irradiated." }],
      },
      baseDollars: 260,
      bearerId: null,
      balance: 5000,
      fragments: 0,
      merchant: 0,
      stranded: null,
      surge: [],
      echo: null,
    });
    renderBoard({
      runs: [makeRun({ id: 21, resolvesAt: new Date(Date.now() - HOUR).toISOString() })],
      deployedIds: new Set([5, 1, 2]),
    });

    await click(screen.getByRole("button", { name: "Claim the Deep Raid" }));

    const ceremony = screen.getByTestId("expedition-ceremony");
    expect(ceremony.textContent).toContain("$260 × 1.5 from the forks");
    expect(within(ceremony).getByText("Eve — Irradiated")).toBeTruthy();
    expect(within(ceremony).getByText("Alba — Wounded")).toBeTruthy();
    expect(within(screen.getByTestId("fate-5")).getByTestId("mutation").querySelector(".card-mut-irradiated")).toBeTruthy();
    expect(screen.queryByTestId("fate-2")).toBeNull();
    expect(within(ceremony).getByTestId("ceremony-events").textContent).toContain("Eve came out of it irradiated");
  });
});

describe("ExpeditionBoard — match day", () => {
  it("names who plays tonight and chips the cards that would surge", () => {
    const copies = [
      makeCopy(1, "Alba", "gold", { card: { ...makeCard("Alba", "Mid"), teamName: "Solari Sun" } }),
      makeCopy(2, "Bex", "silver", { card: { ...makeCard("Bex", "Top"), teamName: "Old Guard" } }),
    ];
    renderBoard({ copies, playingToday: ["Solari Sun", "Lunar Tide"] });

    const banner = screen.getByTestId("match-day");
    expect(banner.textContent).toContain("Solari Sun, Lunar Tide play tonight");
    expect(banner.textContent).toContain("+20%");
    expect(screen.getByTestId("plays-1")).toBeTruthy();
    expect(screen.queryByTestId("plays-2")).toBeNull();
  });

  it("says nothing about match day on a quiet night", () => {
    renderBoard();
    expect(screen.queryByTestId("match-day")).toBeNull();
  });

  it("tells the ceremony the surge paid, and the log that a moment echoed", async () => {
    claimExpeditionAction.mockResolvedValue({
      ok: true,
      outcome: { grade: "solid", dollars: 216, comp: false, mark: null, briefHit: false },
      route: QUIET_ROUTE([5, 1, 2]),
      baseDollars: 180,
      merchant: 0,
      stranded: null,
      surge: ["Solari Sun"],
      echo: { inventoryId: 900, slug: "sun-top", playerName: "Sun Top", moment: 2 },
      bearerId: null,
      balance: 5000,
      fragments: 0,
    });
    renderBoard({
      runs: [
        makeRun({ id: 21, resolvesAt: new Date(Date.now() - HOUR).toISOString() }),
        makeRun({
          id: 22,
          squad: [1, 2, 3],
          claimedAt: "2026-08-28T00:00:00.000Z",
          outcome: {
            grade: "solid", dollars: 216, comp: false, mark: null, bearer: null, lootMultiplier: 1, pushes: 0, fragments: 0,
            fates: [], events: [], rescued: null, cleansed: null, surge: ["Solari Sun"], echo: { slug: "sun-top", week: "2026-08-17", moment: 2 },
          },
        }),
      ],
      deployedIds: new Set([5, 1, 2]),
    });

    await click(screen.getByRole("button", { name: "Claim the Deep Raid" }));

    const ceremony = screen.getByTestId("expedition-ceremony");
    expect(within(ceremony).getByTestId("ceremony-surge").textContent).toContain("Solari Sun played on launch day");
    expect(within(ceremony).getByTestId("ceremony-echo").textContent).toContain("Sun Top");
    const log = screen.getByRole("region", { name: "Finished expeditions" });
    expect(log.textContent).toContain("match day ×1.2");
    expect(log.textContent).toContain("a moment echoed");
  });
});

describe("ExpeditionBoard — the rival fork", () => {
  // A 72h Legendary launched 30 hours ago with four forks: legs of 14.4h,
  // so fork 2 (the singing dark) opened at 28.8h and is open now.
  const legendary = () =>
    makeRun({
      id: 50,
      tier: "legendary",
      squad: [5, 1, 2],
      forks: 4,
      startedAt: new Date(Date.now() - 30 * HOUR).toISOString(),
      resolvesAt: new Date(Date.now() + 42 * HOUR).toISOString(),
    });

  it("names the squad's real next opponent at the singing dark when the page knows it", () => {
    renderBoard({ runs: [legendary()], deployedIds: new Set([5, 1, 2]), rivals: { 50: "Lunar Tide" } });

    const fork = screen.getByTestId("fork-50-1");
    expect(within(fork).getByTestId("rival-story").textContent).toContain("it is Lunar Tide's");
    expect(within(fork).getByText("The singing dark")).toBeTruthy();
  });

  it("keeps the written story when the squad is mixed or nothing is scheduled", () => {
    renderBoard({ runs: [legendary()], deployedIds: new Set([5, 1, 2]) });

    const fork = screen.getByTestId("fork-50-1");
    expect(within(fork).queryByTestId("rival-story")).toBeNull();
    expect(fork.textContent).toContain("Something is singing under the floor and the squad wants to leave.");
  });
});

describe("ExpeditionBoard — convoys", () => {
  const atFork = () =>
    makeRun({
      id: 50,
      tier: "raid",
      squad: [5, 1, 2],
      forks: 2,
      convoy: 5,
      startedAt: new Date(Date.now() - 9 * HOUR).toISOString(),
      resolvesAt: new Date(Date.now() + 15 * HOUR).toISOString(),
    });

  it("sends the convoy choice with the launch, tidied", async () => {
    renderBoard();
    pickTwelveShineSquad();
    fireEvent.change(screen.getByTestId("convoy-mode"), { target: { value: "join" } });
    fireEvent.change(screen.getByLabelText("Convoy code"), { target: { value: " abc234 " } });

    await click(screen.getByRole("button", { name: "Launch Deep Raid" }));

    expect(launchExpeditionAction).toHaveBeenCalledWith("raid", [1, 2, 3], { insured: false, target: null, convoy: "ABC234" });
  });

  it("shows the code on a run waiting for a partner, and the partner once they joined", () => {
    renderBoard({
      runs: [atFork(), makeRun({ id: 51, tier: "legend", squad: [3, 4, 1], convoy: 6 })],
      deployedIds: new Set([5, 1, 2, 3, 4]),
      convoys: {
        50: { code: "ABC234", host: true, partner: null },
        51: { code: "ZZZ999", host: false, partner: { discordId: "77", username: "Rio", runId: 60, choices: [] } },
      },
    });

    expect(screen.getByTestId("convoy-50").textContent).toContain("ABC234");
    expect(screen.getByTestId("convoy-51").textContent).toContain("Convoy with Rio");
  });

  it("tells the fork what the partner said and what that means", () => {
    renderBoard({
      runs: [atFork()],
      deployedIds: new Set([5, 1, 2]),
      convoys: { 50: { code: "ABC234", host: true, partner: { discordId: "77", username: "Rio", runId: 60, choices: [{ index: 0, choice: "camp", at: "" }] } } },
    });

    const line = within(screen.getByTestId("fork-50-0")).getByTestId("convoy-fork");
    expect(line.textContent).toContain("Rio says camp");
    expect(line.textContent).toContain("camps here whatever you say");
  });
});

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import type { InventoryRow } from "@/lib/packs/queries";
import { briefFor, shineOf } from "@/lib/expeditions/config";
import type { ExpeditionRun } from "@/lib/expeditions/queries";
import ExpeditionBoard from "./ExpeditionBoard";

// The two server actions. "use server" modules pull in server-only
// transitively (runs.ts), so jsdom can't load the real one at all — and the
// board's whole job here is what it does with the results.
const { launchExpeditionAction, claimExpeditionAction } = vi.hoisted(() => ({
  launchExpeditionAction: vi.fn(),
  claimExpeditionAction: vi.fn(),
}));
vi.mock("@/lib/expeditions/actions", () => ({ launchExpeditionAction, claimExpeditionAction }));

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
    ...over,
  };
}

function renderBoard(over: { runs?: ExpeditionRun[]; deployedIds?: Set<number> } = {}) {
  return render(
    <ExpeditionBoard
      copies={COPIES}
      runs={over.runs ?? []}
      deployedIds={over.deployedIds ?? new Set([5])}
      today={TODAY}
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
  launchExpeditionAction.mockReset().mockResolvedValue({ ok: true, runId: 99, resolvesAt: "2026-08-28T00:00:00.000Z" });
  claimExpeditionAction.mockReset().mockResolvedValue({
    ok: true,
    outcome: { grade: "solid", dollars: 180, comp: true, mark: "sigil", briefHit: true },
    bearerId: 1,
    balance: 5000,
  });
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
    expect(within(raid).getByText("24 hours away")).toBeTruthy();

    const legend = screen.getByTestId("tier-legend");
    expect(within(legend).getByText("20 shine · 2 foils · 1 signed")).toBeTruthy();
    expect(within(legend).getByText("48 hours away")).toBeTruthy();

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
    expect(launchExpeditionAction).toHaveBeenCalledWith("raid", [1, 2, 3]);
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
    expect(eve.title).toBe("On expedition — back soon.");

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
    expect(within(run).getByText(/Back in 1h 2[89]m/)).toBeTruthy();
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
      outcome: { grade: "solid", dollars: 120, comp: false, mark: null, bearer: null },
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
    expect(within(ceremony).getByText("The expedition chose Alba")).toBeTruthy();
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
      bearerId: null,
      balance: 1040,
    });
    resolvable();

    await click(screen.getByRole("button", { name: "Claim the Deep Raid" }));

    const ceremony = screen.getByTestId("expedition-ceremony");
    expect(ceremony.textContent).toContain("$40");
    expect(within(ceremony).queryByText(/The expedition chose/)).toBeNull();
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

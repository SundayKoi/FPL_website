import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mondayOf } from "@/lib/packs/week";

const {
  fetchStaffTier,
  redirect,
  fetchAllCardSeasons,
  fetchSeasonCards,
  fetchSeasonFixtures,
  fetchEditionWeekInfo,
} = vi.hoisted(() => ({
  fetchStaffTier: vi.fn(),
  redirect: vi.fn(),
  fetchAllCardSeasons: vi.fn(),
  fetchSeasonCards: vi.fn(),
  fetchSeasonFixtures: vi.fn(),
  fetchEditionWeekInfo: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/staffTier", () => ({ fetchStaffTier }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({})) }));
vi.mock("@/lib/betting/service-client", () => ({ createBettingServiceClient: vi.fn(() => ({})) }));
// The whole reads module, because the send-off reads (fetchSeasonFixtures,
// fetchEditionWeekInfo) land alongside this page. The planner itself is NOT
// mocked — the point of this page is that it runs the real one.
vi.mock("@/lib/cards/queries", () => ({
  fetchAllCardSeasons,
  fetchSeasonCards,
  fetchSeasonFixtures,
  fetchEditionWeekInfo,
}));
vi.mock("@/components/cards/PlayerCard3D", () => ({
  default: ({ card }: { card: { name: string; sendoff?: { stage: string } | null } }) => (
    <div data-testid="card" data-stage={card.sendoff?.stage ?? ""}>{card.name}</div>
  ),
}));

const SendoffPreviewPage = (await import("./page")).default;

afterEach(cleanup);

const week = mondayOf(new Date());
/** Midday Monday UTC of the current Eastern week — safely inside it either
 *  side of the offset, so the planner's week match is not a coin flip. */
const inWeek = `${week}T16:00:00.000Z`;

const card = (name: string, team: string, overall: number, role = "Bot") =>
  ({
    slug: name.toLowerCase(),
    name,
    teamName: team,
    role,
    overall,
    standout: false,
    tier: { key: "gold", label: "Gold" },
  }) as never;

const fx = (
  stage: string,
  teamA: string,
  teamB: string,
  scoreA: number | null,
  scoreB: number | null,
  at: string | null = inWeek,
) => ({ stage, team_a: teamA, team_b: teamB, score_a: scoreA, score_b: scoreB, scheduled_at: at }) as never;

const staff = () => fetchStaffTier.mockResolvedValue({ isAdmin: true, isOwner: false, isBroadcaster: false });
const params = (league?: string) => ({ searchParams: Promise.resolve(league ? { league } : {}) });

describe("the send-off preview", () => {
  it("turns away anyone who isn't staff", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: false, isBroadcaster: false });
    fetchAllCardSeasons.mockResolvedValue([]);
    fetchSeasonCards.mockResolvedValue([]);
    fetchSeasonFixtures.mockResolvedValue([]);
    fetchEditionWeekInfo.mockResolvedValue([]);

    render(await SendoffPreviewPage(params()));
    expect(redirect).toHaveBeenCalledWith("/admin");
  });

  it("draws all five stamps on real cards, captioned", async () => {
    staff();
    fetchAllCardSeasons.mockResolvedValue([{ league: "premier", season: "S5" }]);
    fetchSeasonCards.mockResolvedValue([card("Doug", "Gamblers", 92), card("Ana", "Mocha", 88)]);
    fetchSeasonFixtures.mockResolvedValue([]);
    fetchEditionWeekInfo.mockResolvedValue([]);

    render(await SendoffPreviewPage(params()));
    for (const stage of ["gauntlet", "quarterfinalist", "semifinalist", "finalist", "champion"]) {
      expect(screen.getByTestId(`stamp-${stage}`)).toBeTruthy();
    }
    // The caption names the stage and its one line, so a stamp can be judged
    // without knowing the table it came from.
    expect(screen.getByText("Champion of the split")).toBeTruthy();
    expect(screen.getByText("Out in the Semifinals")).toBeTruthy();
    // The card the mockup draws on really wears the mark.
    const stages = [...screen.getAllByTestId("card")].map((node) => node.dataset.stage);
    expect(stages).toEqual(["gauntlet", "quarterfinalist", "semifinalist", "finalist", "champion"]);
    // Fewer cards than stamps is a fresh split, not an error — the wall wraps.
    expect(screen.getAllByText("Doug").length).toBeGreaterThan(0);
  });

  it("dry-runs a decided quarterfinal into eliminations and printed cards", async () => {
    staff();
    fetchAllCardSeasons.mockResolvedValue([{ league: "premier", season: "S5" }]);
    fetchSeasonCards.mockResolvedValue([
      card("Doug", "Gamblers", 92, "Top"),
      card("Ana", "Mocha", 88, "Mid"),
      card("Bo", "Untouched", 70, "Jungle"),
    ]);
    fetchSeasonFixtures.mockResolvedValue([fx("quarterfinals", "Mocha", "Gamblers", 1, 3)]);
    fetchEditionWeekInfo.mockResolvedValue([
      { week, label: "Send-off · Quarterfinals", sendoff: { closesAt: null } },
      { week: "2026-08-24", label: "Week 3 · Aug 24", sendoff: null },
    ]);

    render(await SendoffPreviewPage(params()));
    // The loser of a decided quarterfinal is the only team eliminated.
    expect(screen.getByTestId("elimination-Mocha").textContent).toContain("Quarterfinalist");
    expect(screen.getByTestId("elimination-Mocha").textContent).toContain("1–3");
    expect(screen.getByTestId("elimination-Mocha").textContent).toContain("Gamblers");
    expect(screen.queryByTestId("elimination-Gamblers")).toBeNull();
    // ...and only its player's card prints.
    expect(screen.getByTestId("printed-ana")).toBeTruthy();
    expect(screen.queryByTestId("printed-doug")).toBeNull();
    expect(screen.queryByTestId("printed-bo")).toBeNull();
    // The ledger separates who has printed from who is still in it.
    expect(screen.getByTestId("ledger-Mocha").textContent).toContain("printed");
    expect(screen.getByTestId("ledger-Gamblers").textContent).toContain("alive");
    expect(screen.getByTestId("ledger-Untouched").textContent).toContain("unscheduled");
    // No dated finals yet, so the vault has nothing to count from.
    expect(screen.getByTestId("vault-line").textContent).toContain("Vault date unknown");
    // And the shop lines read as the picker will.
    expect(screen.getByTestId(`shop-${week}`).textContent).toContain("Send-off · Quarterfinals");
  });

  it("says nothing prints while the week's fixtures are undecided", async () => {
    staff();
    fetchAllCardSeasons.mockResolvedValue([{ league: "premier", season: "S5" }]);
    fetchSeasonCards.mockResolvedValue([card("Ana", "Mocha", 88)]);
    fetchSeasonFixtures.mockResolvedValue([fx("semifinals", "Mocha", "Gamblers", null, null)]);
    fetchEditionWeekInfo.mockResolvedValue([]);

    render(await SendoffPreviewPage(params()));
    expect(screen.getByTestId("undecided").textContent).toContain("nothing prints until the scores land");
    expect(screen.queryByTestId("not-playoff")).toBeNull();
    expect(screen.queryByTestId("printed-ana")).toBeNull();
  });

  it("says an ordinary week prints an ordinary edition", async () => {
    staff();
    fetchAllCardSeasons.mockResolvedValue([{ league: "premier", season: "S5" }]);
    fetchSeasonCards.mockResolvedValue([card("Ana", "Mocha", 88)]);
    fetchSeasonFixtures.mockResolvedValue([fx("week_5", "Mocha", "Gamblers", 2, 0)]);
    fetchEditionWeekInfo.mockResolvedValue([]);

    render(await SendoffPreviewPage(params()));
    expect(screen.getByTestId("not-playoff").textContent).toContain("Tuesday prints a weekly edition");
  });

  it("names a team the fixtures spell differently from the cards", async () => {
    // The failure this page exists to catch: the bracket says one thing,
    // raw_stats.team_name says another, and somebody's only playoff card
    // silently fails to print.
    staff();
    fetchAllCardSeasons.mockResolvedValue([{ league: "premier", season: "S5" }]);
    fetchSeasonCards.mockResolvedValue([card("Ana", "Mocha House", 88)]);
    fetchSeasonFixtures.mockResolvedValue([fx("finals", "Mocha", "Gamblers", 1, 3)]);
    fetchEditionWeekInfo.mockResolvedValue([]);

    render(await SendoffPreviewPage(params()));
    expect(screen.getByTestId("unmatched").textContent).toContain("Mocha");
    // A dated finals gives the vault something to count fourteen days from.
    expect(screen.getByTestId("vault-line").textContent).toContain("vault");
    expect(screen.getByTestId("vault-line").textContent).not.toContain("unknown");
  });

  it("switches leagues on the query string", async () => {
    staff();
    fetchAllCardSeasons.mockResolvedValue([
      { league: "premier", season: "S5" },
      { league: "academy", season: "A5" },
    ]);
    fetchSeasonCards.mockResolvedValue([]);
    fetchSeasonFixtures.mockResolvedValue([]);
    fetchEditionWeekInfo.mockResolvedValue([]);

    render(await SendoffPreviewPage(params("academy")));
    expect(fetchSeasonCards).toHaveBeenCalledWith(expect.anything(), "A5");
    expect(screen.getByTestId("league-academy").getAttribute("aria-current")).toBe("page");
    expect(screen.getByTestId("league-premier").getAttribute("aria-current")).toBeNull();
  });

  it("promises in its own copy that it writes nothing", async () => {
    staff();
    fetchAllCardSeasons.mockResolvedValue([{ league: "premier", season: "S5" }]);
    fetchSeasonCards.mockResolvedValue([]);
    fetchSeasonFixtures.mockResolvedValue([]);
    fetchEditionWeekInfo.mockResolvedValue([]);

    render(await SendoffPreviewPage(params()));
    expect(screen.getByText(/Preview only/)).toBeTruthy();
    expect(screen.getByText(/mints, archives, prices or writes anything/)).toBeTruthy();
  });
});

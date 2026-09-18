import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SENDOFF_LOOKS } from "@/lib/cards/sendoffLooks";
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
  // The overlay comes back out as attributes so the look wall can be
  // checked for what it actually hands the renderer — the chip line and
  // the layer stack — without rendering any CSS.
  default: ({
    card,
    overlay,
  }: {
    card: { name: string; sendoff?: { stage: string } | null };
    overlay?: { front: string[]; chip?: string; accent: string } | null;
  }) => (
    <div
      data-testid="card"
      data-stage={card.sendoff?.stage ?? ""}
      data-chip={overlay?.chip ?? ""}
      data-front={overlay?.front.join("|") ?? ""}
      data-accent={overlay?.accent ?? ""}
    >
      {card.name}
    </div>
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
    const wall = screen.getByLabelText("The five exits");
    const stages = [...wall.querySelectorAll<HTMLElement>("[data-testid='card']")].map((node) => node.dataset.stage);
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

  it("draws six looks, three stages each — the shipped one bare, the five over it", async () => {
    staff();
    fetchAllCardSeasons.mockResolvedValue([{ league: "premier", season: "S5" }]);
    fetchSeasonCards.mockResolvedValue([
      card("Doug", "Gamblers", 92, "Top"),
      card("Ana", "Mocha", 88, "Mid"),
      card("Bo", "Untouched", 84, "Jungle"),
    ]);
    fetchSeasonFixtures.mockResolvedValue([]);
    fetchEditionWeekInfo.mockResolvedValue([]);

    render(await SendoffPreviewPage(params()));
    const section = screen.getByLabelText("Looks");
    expect(section).toBeTruthy();

    expect(SENDOFF_LOOKS.filter((look) => look.shipped)).toHaveLength(1);
    for (const look of SENDOFF_LOOKS) {
      const key = look.key;
      const row = screen.getByTestId(`look-${key}`);
      const figures = [...row.querySelectorAll<HTMLElement>("[data-look-stage]")];
      // The same three faces, in the same order, in every row — a look can
      // only be compared against another look like for like.
      expect(figures.map((figure) => figure.dataset.lookStage), key).toEqual([
        "quarterfinalist",
        "finalist",
        "champion",
      ]);
      const drawn = [...row.querySelectorAll<HTMLElement>("[data-testid='card']")];
      expect(drawn.map((node) => node.textContent), key).toEqual(["Doug", "Ana", "Bo"]);
      expect(drawn.map((node) => node.dataset.stage), key).toEqual(["quarterfinalist", "finalist", "champion"]);

      if (look.shipped) {
        // The shipped print is the card itself: an overlay here would draw
        // its masthead a second time over the card's own. The row is marked
        // so the wall says which one is real.
        for (const node of drawn) {
          expect(node.dataset.front, key).toBe("");
          expect(node.dataset.chip, key).toBe("");
        }
        expect(screen.getByTestId(`shipped-${key}`).textContent).toBe("Shipped");
        expect(row.textContent).toContain("Shipped");
        continue;
      }

      // Each mockup card is stamped AND overlaid: the look sits on a real mark.
      for (const node of drawn) expect(node.dataset.front, key).toBeTruthy();
      expect(drawn[2].dataset.chip).toBe("CHAMPION · 3–1 · FINALS");
      // ...and the Champion is not the Finalist with a different word on it.
      expect(drawn[2].dataset.front, key).not.toBe(drawn[1].dataset.front);
    }
    // ...and the page says in its own copy which one shipped.
    expect(screen.getByText(/Newsprint is the shipped treatment/)).toBeTruthy();

    // The reference row: the same real card three ways, for scale.
    for (const id of ["reference-season", "reference-line", "reference-sendoff"]) {
      const figure = screen.getByTestId(id);
      expect(figure.textContent, id).toContain("Doug");
    }
    expect(screen.getByTestId("reference-sendoff").querySelector<HTMLElement>("[data-testid='card']")?.dataset.stage).toBe(
      "semifinalist",
    );
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

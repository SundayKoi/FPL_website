import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PremiumHub from "./PremiumHub";
import type { PlayerCardData } from "@/lib/cards/build";

vi.mock("@/components/cards/PlayerCard3D", () => ({
  default: ({ card }: { card: PlayerCardData }) => <div data-testid="player-card-preview">{card.name}</div>,
}));

afterEach(() => cleanup());

const snapshot = {
  league: "premier" as const,
  cards: { status: "empty" as const, message: "No rated cards are available yet." },
  betting: {
    status: "ready" as const,
    data: {
      balance: 1250,
      event: {
        id: 1,
        name: "Friday Night",
        description: null,
        league: "premier" as const,
        open_markets: 1,
        locked_markets: 0,
        has_live_pickem: false,
        next_lock_at: null,
      },
      market: {
        id: 7,
        title: null,
        status: "OPEN" as const,
        game_at: "2030-01-01T01:00:00Z",
        lock_at: "2030-01-01T00:55:00Z",
        team_a: { id: 1, name: "New Origins", short_code: "NOA", color: "#3b82f6", logo_url: null },
        team_b: { id: 2, name: "DoV Twisted", short_code: "DOVT", color: "#ef4444", logo_url: null },
        pool_a: 4970,
        pool_b: 3010,
        pool_draw: 0,
        draw_enabled: false,
        open_line_prob_a: null,
        event_name: "Friday Night",
      },
    },
  },
  banger: { status: "empty" as const, message: "The next take is warming up." },
};

const previewCard = {
  slug: "preview-card",
  name: "Preview Card",
  overall: 74,
  tier: { key: "gold", label: "Gold" },
} as PlayerCardData;
const challengerCard = {
  slug: "challenger-card",
  name: "Challenger Card",
  overall: 81,
  tier: { key: "diamond", label: "Diamond" },
} as PlayerCardData;
const snapshotWithCard = {
  ...snapshot,
  cards: {
    status: "ready" as const,
    data: { card: previewCard, challengerCard, count: 2, season: "S5", selection: "random" as const },
  },
};

describe("PremiumHub betting preview", () => {
  it("links members to the daily puzzle for the selected league", () => {
    render(<PremiumHub snapshot={snapshot} />);

    // The stale "new feature" banner is gone; the daily games section is
    // the one place that lists them, and it says when they reset.
    expect(screen.queryByRole("complementary", { name: "New feature announcement" })).toBeNull();
    expect(screen.getAllByText(/reset at midnight Eastern/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/midnight UTC/)).toBeNull();

    const destinations = screen.getByRole("navigation", { name: "Premium destinations" });
    expect(within(destinations).queryByRole("link", { name: /FPL'dle/ })).toBeNull();
    const dailyGames = screen.getByRole("region", { name: "Daily games" });
    expect(dailyGames.getAttribute("id")).toBe("daily-games");
    expect(within(dailyGames).getByRole("link", { name: /FPL'dle/ }).getAttribute("href")).toBe("/fpldle");
    expect(within(dailyGames).getByRole("link", { name: /Higher or Lower/ }).getAttribute("href")).toBe("/higher-lower");
    expect(within(dailyGames).queryByRole("link", { name: /Guess the Card/ })).toBeNull();
    expect(within(dailyGames).queryByText("Admin test")).toBeNull();
    const higherLowerPreview = screen.getByRole("img", { name: "Higher or Lower game preview" });
    expect(within(higherLowerPreview).getAllByTestId("higher-lower-preview-card")).toHaveLength(2);
    expect(within(higherLowerPreview).getByText("↑")).toBeTruthy();
    expect(within(higherLowerPreview).getByText("↓")).toBeTruthy();
    expect(screen.queryByText(/Admin\/owner preview for now/)).toBeNull();
    expect(screen.queryByText(/Owners can replay completed runs/)).toBeNull();

    cleanup();
    render(<PremiumHub snapshot={{ ...snapshot, league: "academy" as const }} />);
    const academyDailyGames = screen.getByRole("region", { name: "Daily games" });
    expect(academyDailyGames.getAttribute("id")).toBe("daily-games");
    expect(within(academyDailyGames).getByRole("link", { name: /FPL'dle/ }).getAttribute("href")).toBe("/academy/fpldle");
    expect(within(academyDailyGames).getByRole("link", { name: /Higher or Lower/ }).getAttribute("href")).toBe("/academy/higher-lower");
    // Still in testing: members are not offered it; staff are.
    expect(within(academyDailyGames).queryByRole("link", { name: /Guess the Card/ })).toBeNull();
    cleanup();
    render(<PremiumHub snapshot={{ ...snapshot, league: "academy" as const }} staff />);
    expect(within(screen.getByRole("region", { name: "Daily games" })).getByRole("link", { name: /Guess the Card/ }).getAttribute("href")).toBe("/academy/guess-the-card");
  });

  it("walks a new member through the five first things, and goes away once they are done", () => {
    const start = { discordLinked: true, claim: "pending" as const, cardHref: "/card/preview-card", signed: false, packOpened: false, autoDust: false };
    render(<PremiumHub snapshot={{ ...snapshot, start }} />);

    const list = screen.getByTestId("premium-start-here");
    expect(within(list).getByText("1 of 5 done")).toBeTruthy();
    expect(within(list).getByTestId("start-step-discord").getAttribute("data-done")).toBe("true");
    // A claim in the queue is not a link to go and claim again.
    expect(within(list).getByText(/waiting on a captain/i)).toBeTruthy();
    expect(within(list).getByText(/after your claim is confirmed/i)).toBeTruthy();
    expect(within(list).getByRole("link", { name: /rip one/i }).getAttribute("href")).toBe("/cards/packs");
    expect(within(list).getByRole("link", { name: /set the rule/i }).getAttribute("href")).toBe("/cards/collection#auto-dust");

    cleanup();
    render(<PremiumHub snapshot={{ ...snapshot, start: { ...start, claim: "approved" as const } }} />);
    expect(screen.getByRole("link", { name: /open your card/i }).getAttribute("href")).toBe("/card/preview-card");

    cleanup();
    render(<PremiumHub snapshot={{ ...snapshot, league: "academy" as const, start: { ...start, discordLinked: false } }} />);
    expect(screen.getByRole("link", { name: /^sign in/i }).getAttribute("href")).toBe("/login?redirect=/premium");
    expect(screen.queryByRole("link", { name: /rip one/i })).toBeNull();

    cleanup();
    render(<PremiumHub snapshot={{ ...snapshot, start: { discordLinked: true, claim: "approved" as const, cardHref: "/card/x", signed: true, packOpened: true, autoDust: true } }} />);
    expect(screen.queryByTestId("premium-start-here")).toBeNull();

    cleanup();
    render(<PremiumHub snapshot={{ ...snapshot, start: null }} />);
    expect(screen.queryByTestId("premium-start-here")).toBeNull();
  });

  it("keeps card-specific deep links out of the hub", () => {
    render(<PremiumHub snapshot={snapshot} />);

    expect(screen.queryByRole("heading", { name: "Your card economy" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Go deeper" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Open Packs/i })).toBeNull();
  });

  it("uses compact player cards for the Higher or Lower snapshot", () => {
    render(<PremiumHub snapshot={snapshotWithCard} />);

    const higherLowerPreview = screen.getByRole("img", { name: "Higher or Lower game preview" });
    expect(within(higherLowerPreview).getAllByTestId("player-card-preview")).toHaveLength(2);
    expect(within(higherLowerPreview).getByText("Preview Card")).toBeTruthy();
    expect(within(higherLowerPreview).getByText("Challenger Card")).toBeTruthy();
  });

  it("offers detailed patron support from the premium edge heading", () => {
    render(<PremiumHub snapshot={snapshot} />);

    const trigger = screen.getByRole("button", { name: /become a patron/i });
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: /become a patron/i });
    expect(dialog.textContent).toContain("$3–$5 a month");
    expect(dialog.textContent).toContain("The Patron Flame");
    expect(dialog.textContent).toContain("The weekly re-roll");
    expect(within(dialog).getByRole("link", { name: /paypal/i }).getAttribute("href")).toBe(
      "https://www.paypal.com/paypalme/ZBultman",
    );
    expect(within(dialog).getByRole("link", { name: /venmo.*zachari/i }).getAttribute("href")).toBe(
      "https://venmo.com/u/Zachari-Bultman",
    );
    expect(within(dialog).getByRole("link", { name: /venmo.*matthew/i }).getAttribute("href")).toBe(
      "https://venmo.com/u/Mwolanski1",
    );

    fireEvent.click(within(dialog).getByRole("button", { name: /close patron details/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows a live bettable game and the member wallet", () => {
    render(<PremiumHub snapshot={snapshot} />);

    expect(screen.getByText("New Origins")).toBeTruthy();
    expect(screen.getByText("DoV Twisted")).toBeTruthy();
    expect(screen.getByText("Betting open")).toBeTruthy();
    expect(screen.getByText("$7,980 pool")).toBeTruthy();
    expect(screen.getByText("$1,250")).toBeTruthy();
    expect(screen.getByText(/Rate the latest take and vote once a day\. One shared reward a day/)).toBeTruthy();
  });

  it("shows an explicit empty state when no market is available", () => {
    render(
      <PremiumHub
        snapshot={{
          ...snapshot,
          betting: { ...snapshot.betting, data: { ...snapshot.betting.data, market: null } },
        }}
      />,
    );

    expect(screen.getByText("No bettable games are open right now.")).toBeTruthy();
  });
});

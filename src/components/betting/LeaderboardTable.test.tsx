import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import type { LeaderboardRow } from "@/lib/betting/types";
import { LeaderboardTable } from "./LeaderboardTable";

afterEach(() => {
  cleanup();
});

const byBalance: LeaderboardRow[] = [
  { rank: 1, discord_id: "1", username: "Rich", avatar_url: null, balance: 9000, profit: 200, badges: ["🔥3"] },
  { rank: 2, discord_id: "2", username: "Mid", avatar_url: null, balance: 3000, profit: -100, badges: [] },
];
const byProfit: LeaderboardRow[] = [
  { rank: 1, discord_id: "2", username: "Mid", avatar_url: null, balance: 3000, profit: -100, badges: [] },
  { rank: 2, discord_id: "1", username: "Rich", avatar_url: null, balance: 9000, profit: 200, badges: ["🔥3"] },
];

describe("LeaderboardTable", () => {
  it("shows the balance ranking by default, with badges", () => {
    render(<LeaderboardTable byBalance={byBalance} byProfit={byProfit} meId={null} />);
    const rows = screen.getAllByRole("row").slice(1); // skip header
    expect(rows[0].textContent).toContain("Rich");
    expect(rows[0].textContent).toContain("$9,000");
    expect(rows[0].textContent).toContain("🔥3");
  });

  it("switches to the profit ranking, showing negative profit in red with a minus sign", () => {
    render(<LeaderboardTable byBalance={byBalance} byProfit={byProfit} meId={null} />);
    fireEvent.click(screen.getByRole("button", { name: /top profit/i }));
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0].textContent).toContain("Mid");
    expect(rows[0].textContent).toContain("-$100");
  });

  it("highlights the signed-in viewer's own row", () => {
    render(<LeaderboardTable byBalance={byBalance} byProfit={byProfit} meId="2" />);
    const rows = screen.getAllByRole("row").slice(1);
    const meRow = rows.find((r) => r.textContent?.includes("Mid"));
    expect(meRow?.className).toContain("bg-gold/5");
  });

  it("shows an empty state when there are no players", () => {
    render(<LeaderboardTable byBalance={[]} byProfit={[]} meId={null} />);
    expect(screen.getByText(/no players yet/i)).toBeTruthy();
  });
});

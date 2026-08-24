import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminBangerTitles from "./AdminBangerTitles";

const { from, upsert, refresh } = vi.hoisted(() => {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  return { from: vi.fn(() => ({ upsert })), upsert, refresh: vi.fn() };
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const initial = {
  heroTitle: "Bangers",
  dailyTitle: "Daily check",
  podiumTitle: "Top 3 leaderboard",
  stinkerTitle: "Stinker leaderboard",
  recentTitle: "Recent feed",
  randomTitle: "Random pull",
};

afterEach(() => {
  cleanup();
  from.mockReturnValue({ upsert });
  upsert.mockReset();
  upsert.mockResolvedValue({ error: null });
  refresh.mockReset();
});

describe("AdminBangerTitles", () => {
  it("starts collapsed and reveals title fields when opened", () => {
    render(<AdminBangerTitles initial={initial} />);

    const heading = screen.getByText("Banger Board titles");
    const disclosure = heading.closest("details");
    expect(disclosure).not.toBeNull();
    expect(disclosure?.open).toBe(false);

    fireEvent.click(heading);

    expect(disclosure?.open).toBe(true);
    expect(screen.getByDisplayValue("Bangers")).not.toBeNull();
  });
});

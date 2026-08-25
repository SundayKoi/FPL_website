import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FixtureRow } from "@/lib/schedule/types";
import BroadcasterFixtureHeader from "./BroadcasterFixtureHeader";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const fixture: FixtureRow = {
  id: "fixture-1",
  season: "S5",
  stage: "week_1",
  division: "Solari",
  team_a: "Blue Team",
  team_b: "Red Team",
  scheduled_at: "2026-08-24T00:00:00Z",
  best_of: 3,
  score_a: null,
  score_b: null,
  sort_order: 0,
  created_at: "2026-08-19T00:00:00Z",
};

function stubClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
}

describe("BroadcasterFixtureHeader", () => {
  it("copies the absolute OBS overlay URL and links to the draft", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);

    render(<BroadcasterFixtureHeader fixture={fixture} twitchUrl="https://twitch.tv/fpl" />);

    expect(screen.getByRole("link", { name: /open draft/i }).getAttribute("href"))
      .toBe("/match-draft/fixture-1");
    fireEvent.click(screen.getByRole("button", { name: /copy obs overlay/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(
      "http://localhost:3000/match-draft/fixture-1?overlay=1&bg=transparent",
    ));
    expect(await screen.findByText("Copied ✓")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("OBS overlay URL copied");
    expect(screen.getByRole("link", { name: /watch on twitch/i }).getAttribute("href"))
      .toBe("https://twitch.tv/fpl");
  });

  it("shows a read-only URL when clipboard access fails and omits Twitch when unavailable", async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error("Clipboard denied")));

    render(<BroadcasterFixtureHeader fixture={fixture} twitchUrl={null} />);

    fireEvent.click(screen.getByRole("button", { name: /copy obs overlay/i }));

    const fallback = await screen.findByLabelText("OBS overlay URL");
    expect(fallback).toHaveProperty("readOnly", true);
    expect(fallback).toHaveProperty(
      "value",
      "http://localhost:3000/match-draft/fixture-1?overlay=1&bg=transparent",
    );
    expect(screen.queryByRole("link", { name: /twitch/i })).toBeNull();
  });
});

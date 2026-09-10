import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CampaignPanel from "./CampaignPanel";
import type { CampaignState } from "@/lib/expeditions/campaigns";

afterEach(cleanup);

const open: CampaignState = {
  id: 7,
  key: "broken_map",
  stage: 1,
  runs: [40],
  road: ["waterworks", "pits"],
  log: [{ tier: "scout", grade: "poor", pushes: 0, survivors: 3, places: [], claimedAt: "2026-09-09T00:00:00Z" }],
  startedAt: "2026-09-08T00:00:00Z",
  finishedAt: null,
  abandoned: false,
  relic: null,
};

describe("CampaignPanel", () => {
  it("offers both campaigns when none is open, and opens one", async () => {
    const onStart = vi.fn().mockResolvedValue(null);
    render(<CampaignPanel campaign={null} onStart={onStart} onAbandon={vi.fn()} />);
    expect(screen.getByTestId("campaign-broken_map").textContent).toContain("Scouting Run → Deep Raid → Legend Hunt");
    expect(screen.getByTestId("campaign-lost_print").textContent).toContain("Legendary route");
    fireEvent.click(screen.getByRole("button", { name: /Begin The Lost Print/ }));
    await waitFor(() => expect(onStart).toHaveBeenCalledWith("lost_print"));
  });

  it("follows the open campaign: the stage, the road the last stage set, and what is out", () => {
    render(<CampaignPanel campaign={open} onStart={vi.fn()} onAbandon={vi.fn()} />);
    expect(screen.getByTestId("campaign-stage").textContent).toBe("Stage 2 of 3 — send a Deep Raid");
    expect(screen.getByTestId("campaign-stage-0").textContent).toContain("✓");
    expect(screen.getByTestId("campaign-story").textContent).toContain("A poor scout: the raid opens in the flooded works.");
    expect(screen.getByTestId("campaign-story").textContent).toContain("The flooded works → The dog pits");
    cleanup();
    render(<CampaignPanel campaign={{ ...open, runs: [40, 41] }} onStart={vi.fn()} onAbandon={vi.fn()} />);
    expect(screen.getByTestId("campaign-stage").textContent).toBe("Stage 2 of 3 — in the field");
    expect(screen.getByTestId("campaign-stage-1").textContent).toContain("out");
  });

  it("abandons on the second tap only", async () => {
    const onAbandon = vi.fn().mockResolvedValue(null);
    render(<CampaignPanel campaign={open} onStart={vi.fn()} onAbandon={onAbandon} />);
    fireEvent.click(screen.getByTestId("campaign-abandon"));
    expect(onAbandon).not.toHaveBeenCalled();
    expect(screen.getByTestId("campaign-abandon").textContent).toContain("Tap again");
    fireEvent.click(screen.getByTestId("campaign-abandon"));
    await waitFor(() => expect(onAbandon).toHaveBeenCalledWith(7));
  });

  it("shows the server's refusal", async () => {
    const onStart = vi.fn().mockResolvedValue("A campaign is already open.");
    render(<CampaignPanel campaign={null} onStart={onStart} onAbandon={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Begin The Broken Map/ }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "A campaign is already open.");
  });
});

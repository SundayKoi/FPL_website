import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { openAction, refresh } = vi.hoisted(() => ({
  openAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/packs/season-end-actions", () => ({ openSeasonEndPackAction: openAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./CollectibleRenderer", () => ({ default: () => <div data-testid="collectible" /> }));

import SeasonEndPackShop from "./SeasonEndPackShop";
import type { SeasonEndRelease } from "@/lib/season-end/release-queries";

const release = {
  id: "00000000-0000-0000-0000-000000000001",
  league: "premier",
  season: "S5",
  state: "public",
  paused: false,
  price: 500,
  catalogHash: "catalog",
  rulesVersion: "rules",
  catalogVersion: 1,
  withheldAwards: [],
  signatureCalibration: { achievablePackProbability: 0.01 },
  testApprovedAt: null,
  testApprovedBy: null,
  publishedAt: null,
  revisionDigest: "revision",
  economyVersion: "economy",
  economyRules: {},
  rulesPayload: {},
  signingBook: [],
  sourceCompleteness: {},
  verificationReport: null,
  lockedAt: null,
  lockedBy: null,
  legacyContract: false,
} satisfies SeasonEndRelease;

const shopProps = {
  league: "premier" as const,
  season: "S5",
  release,
  catalog: null,
  viewerId: "viewer-1",
};

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  window.localStorage.clear();
  vi.resetAllMocks();
});

describe("SeasonEndPackShop recovery", () => {
  it("uses the shared clickable card-back reveal stage", async () => {
    vi.useFakeTimers();
    const cards = Array.from({ length: 5 }, (_, index) => ({
      design: {
        kind: index === 4 ? "best_of" : "season",
        designId: `design-${index}`,
        display: { title: `Season card ${index + 1}` },
      },
      foil: index === 4,
      foilType: index === 4 ? "prisma" : null,
      signed: false,
      autograph: null,
      guaranteedFoil: index === 4,
      inventoryId: index + 1,
    })) as never;
    openAction.mockResolvedValue({
      ok: true,
      cards,
      balance: 500,
      openingId: "opening",
      releaseId: release.id,
      mode: "public",
      price: 500,
      revealOrder: [1, 2, 3, 4, 5],
      autoDustProtected: true,
    });

    render(<SeasonEndPackShop {...shopProps} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open for 500 betting dollars" }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("dialog", { name: "Opening a card pack" })).toBeTruthy();

    const rip = screen.getByRole("button", { name: /rip it open/i });
    fireEvent.click(rip);
    fireEvent.click(rip);
    fireEvent.click(rip);
    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });

    expect(screen.getAllByRole("button", { name: /reveal card \d+ of 5/i })).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Reveal card 1 of 5" }));
    expect(screen.getByTestId("collectible")).toBeTruthy();
  });

  it("acknowledges a refund before allowing a new UUID", async () => {
    openAction.mockResolvedValueOnce({ ok: false, code: "refunded", error: "Opening was refunded." });
    openAction.mockResolvedValueOnce({ ok: true, cards: [], balance: 500, openingId: "opening", releaseId: release.id, mode: "public", price: 500, revealOrder: [], autoDustProtected: true });
    render(<SeasonEndPackShop {...shopProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Open for 500 betting dollars" }));
    await screen.findByText("Opening was refunded.");
    const firstRequest = openAction.mock.calls[0][0].requestId;
    expect(screen.getByRole("button", { name: "Open another pack" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Open another pack" }));
    expect(screen.getByRole("button", { name: "Open for 500 betting dollars" })).toBeTruthy();
    expect(openAction).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Open for 500 betting dollars" }));
    await waitFor(() => expect(openAction).toHaveBeenCalledTimes(2));
    expect(openAction.mock.calls[1][0].requestId).not.toBe(firstRequest);
  });

  it("retries a pending intent with the same UUID", async () => {
    openAction.mockResolvedValue({ ok: false, code: "pending", error: "Still recovering." });
    render(<SeasonEndPackShop {...shopProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Open for 500 betting dollars" }));
    await screen.findByText("Still recovering.");
    // React keeps an async transition pending for a short tick after the
    // server action resolves; wait for the retry control rather than racing
    // that transition under a busy CI worker.
    const retry = await screen.findByRole("button", { name: "Retry recovery" });
    fireEvent.click(retry);
    await waitFor(() => expect(openAction).toHaveBeenCalledTimes(2));
    expect(openAction.mock.calls[1][0].requestId).toBe(openAction.mock.calls[0][0].requestId);
  });

  it("keeps recovery available while the release is paused", async () => {
    const request = "00000000-0000-0000-0000-000000000099";
    window.localStorage.setItem(`season-end-pending:v2:${shopProps.viewerId}:${release.id}:public`, request);
    openAction.mockResolvedValue({ ok: false, code: "pending", error: "Still recovering." });
    render(<SeasonEndPackShop {...shopProps} release={{ ...release, paused: true }} />);

    const retry = await screen.findByRole("button", { name: "Retry recovery" });
    expect(retry.hasAttribute("disabled")).toBe(false);
    expect(openAction).toHaveBeenCalledWith(expect.objectContaining({ requestId: request }));
  });

  it("retries an existing intent even in recovery-only mode", async () => {
    const request = "00000000-0000-0000-0000-000000000100";
    openAction.mockResolvedValue({ ok: false, code: "pending", error: "Still recovering." });
    render(<SeasonEndPackShop {...shopProps} recoveryOnly initialRequestId={request} />);

    const retry = await screen.findByRole("button", { name: "Retry recovery" });
    fireEvent.click(retry);
    await waitFor(() => expect(openAction).toHaveBeenCalledTimes(2));
    expect(openAction.mock.calls[0][0].requestId).toBe(request);
    expect(openAction.mock.calls[1][0].requestId).toBe(request);
  });
});

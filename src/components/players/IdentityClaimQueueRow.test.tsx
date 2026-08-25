import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { decidePlayerIdentityClaim, refresh } = vi.hoisted(() => ({
  decidePlayerIdentityClaim: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/players/identityActions", () => ({ decidePlayerIdentityClaim }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import IdentityClaimQueueRow from "./IdentityClaimQueueRow";

const claim = {
  linkId: "link-1",
  teamName: "Mint Ice Cubes",
  playerName: "Chaseworthy",
  claimantName: "Chase",
  source: "team" as const,
  requestedLabel: "Aug 25, 2026",
};

beforeEach(() => decidePlayerIdentityClaim.mockResolvedValue({ ok: true }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("IdentityClaimQueueRow", () => {
  it("shows the exact team, canonical player, claimant, source, and request date", () => {
    render(<IdentityClaimQueueRow {...claim} />);

    expect(screen.getByText("Chaseworthy")).toBeTruthy();
    expect(screen.getByText(/Mint Ice Cubes/)).toBeTruthy();
    expect(screen.getByText(/claimed by Chase/)).toBeTruthy();
    expect(screen.getByText(/team page/)).toBeTruthy();
    expect(screen.getByText(/Aug 25, 2026/)).toBeTruthy();
  });

  it("approves through the common identity decision action", async () => {
    render(<IdentityClaimQueueRow {...claim} />);

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(decidePlayerIdentityClaim).toHaveBeenCalledWith({
      linkId: "link-1",
      decision: "approve",
    }));
    expect(refresh).toHaveBeenCalled();
  });

  it("rejects by deleting the pending identity through the common action", async () => {
    render(<IdentityClaimQueueRow {...claim} />);

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    await waitFor(() => expect(decidePlayerIdentityClaim).toHaveBeenCalledWith({
      linkId: "link-1",
      decision: "reject",
    }));
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps a rejected decision visible with a safe error", async () => {
    decidePlayerIdentityClaim.mockResolvedValueOnce({ ok: false, error: "Unable to update player identity" });
    render(<IdentityClaimQueueRow {...claim} />);

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(screen.getByText("Unable to update player identity")).toBeTruthy());
    expect(refresh).not.toHaveBeenCalled();
  });
});

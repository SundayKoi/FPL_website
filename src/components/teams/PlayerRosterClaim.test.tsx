import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { requestPlayerIdentityClaim, withdrawPlayerIdentityClaim, refresh } = vi.hoisted(() => ({
  requestPlayerIdentityClaim: vi.fn(),
  withdrawPlayerIdentityClaim: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/players/identityActions", () => ({
  requestPlayerIdentityClaim,
  withdrawPlayerIdentityClaim,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import PlayerRosterClaim, { type PlayerRosterClaimState } from "./PlayerRosterClaim";

const baseProps: {
  playerPoolId: string | null;
  leagueTeamId: string;
  league: "premier";
  season: string;
  returnPath: string;
  signedIn: boolean;
  claimLinkId: string | null;
  unavailable: boolean;
} = {
  playerPoolId: "pool-1",
  leagueTeamId: "team-1",
  league: "premier" as const,
  season: "S5",
  returnPath: "/teams/mint-ice-cubes",
  signedIn: true,
  claimLinkId: null,
  unavailable: false,
};

function renderClaim(state: PlayerRosterClaimState, overrides: Partial<typeof baseProps> = {}) {
  return render(<PlayerRosterClaim {...baseProps} {...overrides} state={state} />);
}

beforeEach(() => {
  requestPlayerIdentityClaim.mockResolvedValue({ ok: true });
  withdrawPlayerIdentityClaim.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PlayerRosterClaim", () => {
  it("returns a signed-out visitor to the same Premier team page", () => {
    renderClaim("unclaimed", { signedIn: false });

    expect(screen.getByRole("link", { name: /sign in to claim/i }).getAttribute("href"))
      .toBe("/login?redirect=/teams/mint-ice-cubes");
  });

  it("requests only the stable roster identity supplied by the server", async () => {
    renderClaim("unclaimed");

    fireEvent.click(screen.getByRole("button", { name: /claim this roster spot/i }));

    await waitFor(() => expect(requestPlayerIdentityClaim).toHaveBeenCalledWith({
      playerPoolId: "pool-1",
      leagueTeamId: "team-1",
      league: "premier",
      season: "S5",
    }));
    expect(refresh).toHaveBeenCalled();
  });

  it("lets the claimant withdraw their own pending request", async () => {
    renderClaim("mine-pending", { claimLinkId: "link-1" });

    fireEvent.click(screen.getByRole("button", { name: /withdraw/i }));

    await waitFor(() => expect(withdrawPlayerIdentityClaim).toHaveBeenCalledWith("link-1"));
    expect(refresh).toHaveBeenCalled();
  });

  it("renders another player's approved state as neutral public text", () => {
    renderClaim("claimed", { signedIn: false });

    expect(screen.getByText("Claimed")).toBeTruthy();
    expect(screen.queryByText(/discord id/i)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders another player's pending state without claimant details", () => {
    renderClaim("pending", { signedIn: false });

    expect(screen.getByText("Pending")).toBeTruthy();
    expect(screen.queryByText(/discord/i)).toBeNull();
  });

  it("shows the signed-in player their approved roster spot", () => {
    renderClaim("mine-approved");

    expect(screen.getByText("This is you")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers no action for an empty or non-canonical roster slot", () => {
    const { container } = renderClaim("unclaimed", { playerPoolId: null });

    expect(container.textContent).toBe("");
  });

  it("offers no claim action when roster claim reads are unavailable", () => {
    renderClaim("unclaimed", { unavailable: true });

    expect(screen.getByText(/Claim status unavailable/i)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link", { name: /claim/i })).toBeNull();
  });

  it("surfaces a safe action failure without refreshing", async () => {
    requestPlayerIdentityClaim.mockResolvedValueOnce({ ok: false, error: "Identity already linked" });
    renderClaim("unclaimed");

    fireEvent.click(screen.getByRole("button", { name: /claim this roster spot/i }));

    await waitFor(() => expect(screen.getByText("Identity already linked")).toBeTruthy());
    expect(refresh).not.toHaveBeenCalled();
  });
});

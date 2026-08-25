import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Card creation and approval are server actions; the browser client remains
 *  only for claimant/moderator deletion under the existing RLS policy. */
const { requestCardClaim, approveCardClaim, del, match, from, refresh } = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  type WriteResult = { error: { message: string } | null };
  const match = vi.fn(async (key: Row): Promise<WriteResult> => {
    void key;
    return { error: null };
  });
  const del = vi.fn(() => ({ match }));
  return {
    requestCardClaim: vi.fn(),
    approveCardClaim: vi.fn(),
    del,
    match,
    from: vi.fn(() => ({ delete: del })),
    refresh: vi.fn(),
  };
});

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ from }) }));
vi.mock("@/lib/cards/claimActions", () => ({ requestCardClaim, approveCardClaim }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import CardClaim, { type CardClaimState } from "./CardClaim";

const card = { season: "S5", summonerName: "Chaseworthy", tag: "NA1" };
const cardKey = { season: "S5", summoner_name: "Chaseworthy", tag: "NA1" };

const pending: CardClaimState = { profileId: "player-1", status: "pending", displayName: "Chase" };
const approved: CardClaimState = { profileId: "player-1", status: "approved", displayName: "Chase" };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CardClaim", () => {
  it("offers the claim to a signed-in stranger and lets the server derive its owner and canonical mapping", async () => {
    requestCardClaim.mockResolvedValueOnce({ ok: true });
    render(<CardClaim {...card} viewerProfileId="player-1" canModerate={false} claim={null} />);

    fireEvent.click(screen.getByRole("button", { name: "This is me — claim this card" }));

    await waitFor(() => expect(requestCardClaim).toHaveBeenCalledWith({
      season: "S5",
      summonerName: "Chaseworthy",
      tag: "NA1",
    }));
    expect(refresh).toHaveBeenCalled();
  });

  it("shows nothing to a signed-out visitor", () => {
    const { container } = render(<CardClaim {...card} viewerProfileId={null} canModerate={false} claim={null} />);

    expect(container.textContent).toBe("");
  });

  it("shows nothing to a moderator on an unclaimed card — they can already edit it", () => {
    const { container } = render(<CardClaim {...card} viewerProfileId="cap-1" canModerate claim={null} />);

    expect(container.textContent).toBe("");
  });

  it("lets a moderator approve through the atomic card-and-identity server action", async () => {
    approveCardClaim.mockResolvedValueOnce({ ok: true });
    render(<CardClaim {...card} viewerProfileId="cap-1" canModerate claim={pending} />);

    expect(screen.getByText("Claim pending — waiting for a captain or admin")).toBeTruthy();
    // The pending claimant's own withdraw button is not the moderator's.
    expect(screen.queryByRole("button", { name: "Withdraw" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(approveCardClaim).toHaveBeenCalledWith({
      season: "S5",
      summonerName: "Chaseworthy",
      tag: "NA1",
    }));
    expect(refresh).toHaveBeenCalled();
  });

  it("lets a moderator reject a pending claim by deleting it", async () => {
    render(<CardClaim {...card} viewerProfileId="cap-1" canModerate claim={pending} />);

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    await waitFor(() => expect(del).toHaveBeenCalled());
    expect(match).toHaveBeenCalledWith(cardKey);
  });

  it("lets the claimant withdraw while they wait", async () => {
    render(<CardClaim {...card} viewerProfileId="player-1" canModerate={false} claim={pending} />);

    // A waiting player gets no say in their own approval.
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));

    await waitFor(() => expect(del).toHaveBeenCalled());
    expect(match).toHaveBeenCalledWith(cardKey);
  });

  it("names the owner once approved, and only a moderator may revoke", () => {
    render(<CardClaim {...card} viewerProfileId="player-1" canModerate={false} claim={approved} />);

    expect(screen.getByText("✓ Claimed by Chase")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Revoke" })).toBeNull();

    cleanup();
    render(<CardClaim {...card} viewerProfileId="cap-1" canModerate claim={approved} />);

    expect(screen.getByRole("button", { name: "Revoke" })).toBeTruthy();
  });

  it("rings the row when the visitor followed a claim link", () => {
    const { container, rerender } = render(
      <CardClaim {...card} viewerProfileId="player-1" canModerate={false} claim={null} highlight />,
    );

    const ringed = container.querySelector(".claim-highlight");
    expect(ringed).toBeTruthy();
    expect(ringed?.className).toContain("ring-coral");

    // Off by default: the ring is for the one visit the link sent.
    rerender(<CardClaim {...card} viewerProfileId="player-1" canModerate={false} claim={null} />);
    expect(container.querySelector(".claim-highlight")).toBeNull();
  });

  it("surfaces a rejected write inline and does not refresh", async () => {
    requestCardClaim.mockResolvedValueOnce({ ok: false, error: "Unable to update card claim" });
    render(<CardClaim {...card} viewerProfileId="player-1" canModerate={false} claim={null} />);

    fireEvent.click(screen.getByRole("button", { name: "This is me — claim this card" }));

    await waitFor(() => expect(screen.getByText("Unable to update card claim")).toBeTruthy());
    expect(refresh).not.toHaveBeenCalled();
  });
});

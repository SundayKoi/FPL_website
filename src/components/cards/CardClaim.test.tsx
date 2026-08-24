import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/** The slice of the supabase builder the component actually reaches for:
 *  insert(row), update(patch).match(key), delete().match(key). */
const { insert, update, del, match, from, refresh } = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  type WriteResult = { error: { message: string } | null };
  const insert = vi.fn(async (row: Row): Promise<WriteResult> => {
    void row;
    return { error: null };
  });
  const match = vi.fn(async (key: Row): Promise<WriteResult> => {
    void key;
    return { error: null };
  });
  const update = vi.fn((patch: Row) => {
    void patch;
    return { match };
  });
  const del = vi.fn(() => ({ match }));
  return { insert, update, del, match, from: vi.fn(() => ({ insert, update, delete: del })), refresh: vi.fn() };
});

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ from }) }));
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
  it("offers the claim to a signed-in stranger and files it as their own", async () => {
    render(<CardClaim {...card} viewerProfileId="player-1" canModerate={false} claim={null} />);

    fireEvent.click(screen.getByRole("button", { name: "This is me — claim this card" }));

    await waitFor(() => expect(insert).toHaveBeenCalledWith({ ...cardKey, profile_id: "player-1" }));
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

  it("lets a moderator approve a pending claim", async () => {
    render(<CardClaim {...card} viewerProfileId="cap-1" canModerate claim={pending} />);

    expect(screen.getByText("Claim pending — waiting for a captain or admin")).toBeTruthy();
    // The pending claimant's own withdraw button is not the moderator's.
    expect(screen.queryByRole("button", { name: "Withdraw" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][0]).toMatchObject({ status: "approved", decided_by: "cap-1" });
    expect(match).toHaveBeenCalledWith(cardKey);
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
    insert.mockResolvedValueOnce({ error: { message: "new row violates row-level security policy" } });
    render(<CardClaim {...card} viewerProfileId="player-1" canModerate={false} claim={null} />);

    fireEvent.click(screen.getByRole("button", { name: "This is me — claim this card" }));

    await waitFor(() => expect(screen.getByText("new row violates row-level security policy")).toBeTruthy());
    expect(refresh).not.toHaveBeenCalled();
  });
});

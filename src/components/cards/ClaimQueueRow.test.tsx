import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Approval crosses the server-action boundary; rejection stays an RLS'd
 *  delete because it has no identity side effect. */
const { approveCardClaim, del, match, from, refresh } = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  type WriteResult = { error: { message: string } | null };
  const match = vi.fn(async (key: Row): Promise<WriteResult> => {
    void key;
    return { error: null };
  });
  const del = vi.fn(() => ({ match }));
  return { approveCardClaim: vi.fn(), del, match, from: vi.fn(() => ({ delete: del })), refresh: vi.fn() };
});

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ from }) }));
vi.mock("@/lib/cards/claimActions", () => ({ approveCardClaim }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import ClaimQueueRow from "./ClaimQueueRow";

const row = {
  season: "S5",
  summonerName: "Chaseworthy",
  tag: "NA1",
  slug: "chaseworthy-na1",
  claimantName: "Chase",
  createdLabel: "Aug 20, 2026",
};
const cardKey = { season: "S5", summoner_name: "Chaseworthy", tag: "NA1" };

beforeEach(() => approveCardClaim.mockResolvedValue({ ok: true }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ClaimQueueRow", () => {
  it("names the claimant and links to the card being claimed", () => {
    render(<ClaimQueueRow {...row} />);

    expect(screen.getByText("claimed by Chase · Aug 20, 2026")).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/card/chaseworthy-na1");
  });

  it("approves in one click through the atomic card-and-identity action, then refreshes", async () => {
    approveCardClaim.mockResolvedValueOnce({ ok: true });
    render(<ClaimQueueRow {...row} />);

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(approveCardClaim).toHaveBeenCalledWith({
      season: "S5",
      summonerName: "Chaseworthy",
      tag: "NA1",
    }));
    expect(refresh).toHaveBeenCalled();
  });

  it("makes reject ask twice before deleting the claim", async () => {
    render(<ClaimQueueRow {...row} />);

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    // First click only arms the button — nothing has been thrown away yet.
    expect(del).not.toHaveBeenCalled();
    const confirm = await screen.findByRole("button", { name: "Confirm reject" });

    fireEvent.click(confirm);

    await waitFor(() => expect(del).toHaveBeenCalled());
    expect(match).toHaveBeenCalledWith(cardKey);
    expect(refresh).toHaveBeenCalled();
  });

  it("surfaces a rejected write inline and does not refresh", async () => {
    approveCardClaim.mockResolvedValueOnce({ ok: false, error: "Unable to update card claim" });
    render(<ClaimQueueRow {...row} />);

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(screen.getByText("Unable to update card claim")).toBeTruthy());
    expect(refresh).not.toHaveBeenCalled();
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/** The slice of the supabase builder the row reaches for:
 *  update(patch).match(key) and delete().match(key). */
const { update, del, match, from, refresh } = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  type WriteResult = { error: { message: string } | null };
  const match = vi.fn(async (key: Row): Promise<WriteResult> => {
    void key;
    return { error: null };
  });
  const update = vi.fn((patch: Row) => {
    void patch;
    return { match };
  });
  const del = vi.fn(() => ({ match }));
  return { update, del, match, from: vi.fn(() => ({ update, delete: del })), refresh: vi.fn() };
});

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ from }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import ClaimQueueRow from "./ClaimQueueRow";

const row = {
  season: "S5",
  summonerName: "Chaseworthy",
  tag: "NA1",
  slug: "chaseworthy-na1",
  claimantName: "Chase",
  createdLabel: "Aug 20, 2026",
  viewerProfileId: "cap-1",
};
const cardKey = { season: "S5", summoner_name: "Chaseworthy", tag: "NA1" };

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

  it("approves in one click, stamping the decider, then refreshes", async () => {
    render(<ClaimQueueRow {...row} />);

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][0]).toMatchObject({ status: "approved", decided_by: "cap-1" });
    expect(match).toHaveBeenCalledWith(cardKey);
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
    match.mockResolvedValueOnce({ error: { message: "new row violates row-level security policy" } });
    render(<ClaimQueueRow {...row} />);

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(screen.getByText("new row violates row-level security policy")).toBeTruthy());
    expect(refresh).not.toHaveBeenCalled();
  });
});

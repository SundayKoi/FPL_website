import { beforeEach, describe, expect, it, vi } from "vitest";

const { getBettingUser } = vi.hoisted(() => ({ getBettingUser: vi.fn() }));
vi.mock("@/lib/betting/wallet", () => ({ getBettingUser }));

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/betting/service-client", () => ({ createBettingServiceClient: vi.fn(() => ({ rpc })) }));

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath }));

// The expedition core is server-only and takes a bare id on trust; this
// action never reaches it, so a stand-in keeps the test to the action.
vi.mock("./runs", () => ({
  claimExpeditionFor: vi.fn(),
  decideForkFor: vi.fn(),
  friendlyExpeditionError: vi.fn((message: string) => message),
  launchExpeditionFor: vi.fn(),
  ransomLostCardFor: vi.fn(),
}));

import { revealRoadAction } from "./actions";

beforeEach(() => {
  getBettingUser.mockReset().mockResolvedValue({ discordId: "me", allowed: true });
  rpc.mockReset().mockResolvedValue({ data: [{ fragments: 2 }], error: null });
  revalidatePath.mockReset();
});

describe("revealRoadAction", () => {
  it("spends for the signed-in collector, never for an id the browser names", async () => {
    await expect(revealRoadAction(42)).resolves.toEqual({ ok: true, fragments: 2 });
    expect(rpc).toHaveBeenCalledWith("reveal_expedition_road", { p_user: "me", p_run: 42 });
    expect(revalidatePath).toHaveBeenCalledWith("/cards/expeditions");
    expect(revalidatePath).toHaveBeenCalledWith("/academy/cards/expeditions");
  });

  it("refuses the signed out and non-members before any spend", async () => {
    getBettingUser.mockResolvedValueOnce(null);
    await expect(revealRoadAction(42)).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/Sign in/) });
    getBettingUser.mockResolvedValueOnce({ discordId: "me", allowed: false });
    await expect(revealRoadAction(42)).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/members only/) });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a run id that is not one", async () => {
    for (const id of [0, -3, 1.5, Number.NaN]) await expect(revealRoadAction(id)).resolves.toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("says what the refusal means, and busts nothing when nothing changed", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "already revealed" } });
    await expect(revealRoadAction(42)).resolves.toEqual({ ok: false, error: "This road is already revealed." });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "not enough fragments" } });
    await expect(revealRoadAction(42)).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/map fragment/) });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reads the fragments left off a single row too", async () => {
    rpc.mockResolvedValueOnce({ data: { fragments: 0 }, error: null });
    await expect(revealRoadAction(42)).resolves.toEqual({ ok: true, fragments: 0 });
  });
});

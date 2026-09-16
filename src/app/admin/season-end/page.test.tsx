import { describe, expect, it, vi } from "vitest";
const redirect = vi.hoisted(() => vi.fn(() => { throw new Error("redirect"); }));
vi.mock("next/navigation", () => ({ redirect }));
import Page from "./page";
describe("legacy season-end route", () => {
  it("keeps existing admin links on the canonical collection", async () => {
    await expect(Page({ searchParams: Promise.resolve({ league: "academy", season: "A1" }) })).rejects.toThrow("redirect");
    expect(redirect).toHaveBeenCalledWith("/admin/seasons-end?league=academy&season=A1");
  });
});

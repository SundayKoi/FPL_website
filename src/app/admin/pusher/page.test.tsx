import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { fetchStaffTier, redirect } = vi.hoisted(() => ({ fetchStaffTier: vi.fn(), redirect: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/staffTier", () => ({ fetchStaffTier }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({})) }));
vi.mock("@/components/pusher/PusherMockup", () => ({ default: () => <div data-testid="machine" /> }));

const PusherPreviewPage = (await import("./page")).default;

afterEach(cleanup);

describe("the pusher mockup page", () => {
  it("turns away anyone who isn't staff", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: false });
    await PusherPreviewPage();
    expect(redirect).toHaveBeenCalledWith("/admin");
  });

  it("shows staff the machine, the design and the numbers, and says it is a preview", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: true, isOwner: false });
    render(await PusherPreviewPage());
    expect(screen.getByTestId("machine")).toBeTruthy();
    expect(screen.getByText(/Preview only/)).toBeTruthy();
    expect(screen.getByText(/One machine for the league/)).toBeTruthy();
    expect(screen.getByText("Pack token")).toBeTruthy();
  });
});

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, signOut, single, readBettingUserMock } = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(),
  single: vi.fn(),
  readBettingUserMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser },
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single })) })),
    })),
  })),
}));

vi.mock("@/lib/betting/wallet", () => ({ readBettingUser: readBettingUserMock }));
vi.mock("@/lib/auth/actions", () => ({ signOut }));

import AuthButton from "./AuthButton";

beforeEach(() => {
  getUser.mockReset();
  signOut.mockReset();
  single.mockReset();
  readBettingUserMock.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "profile-1", email: "member@example.com" } } });
  single.mockResolvedValue({ data: { display_name: "Member" } });
  readBettingUserMock.mockResolvedValue(null);
});

describe("AuthButton", () => {
  it("shows the wallet balance beside a premium member's name", async () => {
    readBettingUserMock.mockResolvedValue({ allowed: true, balance: 1250 });

    render(await AuthButton());

    expect(screen.getByText("Member")).toBeTruthy();
    expect(screen.getByLabelText("Betting dollars balance $1,250")).toBeTruthy();
  });

  it("does not show a wallet balance to non-premium members", async () => {
    readBettingUserMock.mockResolvedValue({ allowed: false, balance: 1250 });

    render(await AuthButton());

    expect(screen.queryByLabelText(/betting dollars balance/i)).toBeNull();
  });

  it("keeps a premium member without a wallet out of the upsell and balance display", async () => {
    readBettingUserMock.mockResolvedValue({ allowed: true, balance: null });
    render(await AuthButton());
    expect(screen.queryByLabelText(/betting dollars balance/i)).toBeNull();
    expect(screen.queryByTestId("get-premium-chip")).toBeNull();
    expect(screen.getByText("Member")).toBeTruthy();
  });
});

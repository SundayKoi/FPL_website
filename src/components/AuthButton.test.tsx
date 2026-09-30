import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, signOut, single, getBettingUserMock } = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(),
  single: vi.fn(),
  getBettingUserMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser },
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single })) })),
    })),
  })),
}));

vi.mock("@/lib/betting/wallet", () => ({ getBettingUser: getBettingUserMock }));
vi.mock("@/lib/auth/actions", () => ({ signOut }));

import AuthButton from "./AuthButton";

beforeEach(() => {
  getUser.mockReset();
  signOut.mockReset();
  single.mockReset();
  getBettingUserMock.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "profile-1", email: "member@example.com" } } });
  single.mockResolvedValue({ data: { display_name: "Member" } });
  getBettingUserMock.mockResolvedValue(null);
});

describe("AuthButton", () => {
  it("shows the wallet balance beside a premium member's name", async () => {
    getBettingUserMock.mockResolvedValue({ allowed: true, balance: 1250 });

    render(await AuthButton());

    expect(screen.getByText("Member")).toBeTruthy();
    expect(screen.getByLabelText("Betting dollars balance $1,250")).toBeTruthy();
  });

  it("does not show a wallet balance to non-premium members", async () => {
    getBettingUserMock.mockResolvedValue({ allowed: false, balance: 1250 });

    render(await AuthButton());

    expect(screen.queryByLabelText(/betting dollars balance/i)).toBeNull();
  });
});

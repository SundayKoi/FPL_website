import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => cleanup());

describe("AuthButton", () => {
  it("links to the login page when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    render(await AuthButton());

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveProperty("pathname", "/login");
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("replaces the sign-in link with a sign-out button when signed in", async () => {
    render(await AuthButton());

    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.getByText("Member")).toBeTruthy();

    const button = screen.getByRole("button", { name: "Sign out" });
    expect(button.closest("form")?.getAttribute("action")).toBeTruthy();
  });

  it("shows the wallet balance beside a premium member's name", async () => {
    getBettingUserMock.mockResolvedValue({ allowed: true, balance: 1250 });

    render(await AuthButton());

    expect(screen.getByText("Member")).toBeTruthy();
    expect(screen.getByLabelText("Premium wallet balance $1,250")).toBeTruthy();
  });

  it("does not show a wallet balance to non-premium members", async () => {
    getBettingUserMock.mockResolvedValue({ allowed: false, balance: 1250 });

    render(await AuthButton());

    expect(screen.queryByLabelText(/premium wallet balance/i)).toBeNull();
  });
});

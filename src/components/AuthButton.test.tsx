import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getUser, signOut } = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { display_name: "dribb" } }),
        }),
      }),
    }),
  })),
}));

vi.mock("@/lib/auth/actions", () => ({ signOut }));

import AuthButton from "./AuthButton";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AuthButton", () => {
  it("links to the login page when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    render(await AuthButton());

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveProperty(
      "pathname",
      "/login",
    );
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("replaces the sign-in link with a sign-out button when signed in", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.c" } } });

    render(await AuthButton());

    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.getByText("dribb")).toBeTruthy();

    const button = screen.getByRole("button", { name: "Sign out" });
    expect(button.closest("form")?.getAttribute("action")).toBeTruthy();
  });
});

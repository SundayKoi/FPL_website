import { describe, expect, it, vi } from "vitest";

const { signOut, redirect } = vi.hoisted(() => ({
  signOut: vi.fn(async () => ({ error: null })),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(async () => ({ auth: { signOut } })),
}));

vi.mock("next/navigation", () => ({ redirect }));

import { signOut as signOutAction } from "./actions";

describe("signOut action", () => {
  it("clears the Supabase session and sends the user home", async () => {
    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT");

    expect(signOut).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/");
  });
});

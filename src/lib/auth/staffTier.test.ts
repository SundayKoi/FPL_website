import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStaffTier } from "./staffTier";

function query(result: unknown) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    single: () => Promise.resolve(result),
  };
  return builder;
}

function supabaseFor(user: { id: string } | null, profileResult: unknown) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
    from: vi.fn(() => query(profileResult)),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchStaffTier", () => {
  it("returns both flags true for an owner", async () => {
    const supabase = supabaseFor({ id: "owner-1" }, { data: { is_admin: true, is_owner: true }, error: null });

    await expect(fetchStaffTier(supabase as never)).resolves.toEqual({ isAdmin: true, isOwner: true });
  });

  it("returns admin true, owner false for a plain admin", async () => {
    const supabase = supabaseFor({ id: "admin-1" }, { data: { is_admin: true, is_owner: false }, error: null });

    await expect(fetchStaffTier(supabase as never)).resolves.toEqual({ isAdmin: true, isOwner: false });
  });

  it("returns both flags false for a signed-out visitor", async () => {
    const supabase = supabaseFor(null, { data: null, error: null });

    await expect(fetchStaffTier(supabase as never)).resolves.toEqual({ isAdmin: false, isOwner: false });
  });

  it("fails closed — both flags false when the profile query errors", async () => {
    const supabase = supabaseFor(
      { id: "user-1" },
      { data: null, error: { code: "500", message: "boom" } },
    );

    await expect(fetchStaffTier(supabase as never)).resolves.toEqual({ isAdmin: false, isOwner: false });
  });
});

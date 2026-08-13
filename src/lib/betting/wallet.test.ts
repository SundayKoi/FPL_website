import { beforeEach, describe, expect, it, vi } from "vitest";

// wallet.ts is `import "server-only"` — vitest resolves that package's
// default export condition (throws by design, to fail client bundles), not
// the "react-server" condition Next.js's bundler uses for this file. Stub
// it out so the module under test can load.
vi.mock("server-only", () => ({}));

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(async () => ({ auth: { getUser } })),
}));

const { rpc, single, from } = vi.hoisted(() => {
  const single = vi.fn();
  const from = vi.fn(() => ({
    select: vi.fn(() => ({ eq: vi.fn(() => ({ single })) })),
  }));
  const rpc = vi.fn(async (): Promise<{ data: unknown; error: unknown }> => ({ data: null, error: null }));
  return { rpc, single, from };
});

vi.mock("./service-client", () => ({
  createBettingServiceClient: vi.fn(() => ({ rpc, from })),
}));

vi.mock("./access", () => ({
  bettingAccess: vi.fn(async () => ({ allowed: true, staff: false, inconclusive: false })),
}));

import { bettingAccess } from "./access";
import { getBettingUser } from "./wallet";

beforeEach(() => {
  getUser.mockReset();
  rpc.mockReset().mockResolvedValue({ data: null, error: null });
  single.mockReset().mockResolvedValue({ data: null });
  from.mockClear();
  vi.mocked(bettingAccess)
    .mockReset()
    .mockResolvedValue({ allowed: true, staff: false, inconclusive: false });
});

describe("getBettingUser", () => {
  it("returns null when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    expect(await getBettingUser()).toBeNull();
  });

  it("returns null when the signed-in user has no linked Discord identity", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "p1", identities: [] } } });

    expect(await getBettingUser()).toBeNull();
  });

  it("grants the signup bonus and returns the wallet with access flags", async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "p1",
          identities: [{ provider: "discord", id: "42" }],
          user_metadata: { full_name: "Zed", avatar_url: "https://cdn/x.png" },
        },
      },
    });
    single.mockResolvedValue({ data: { balance: 1500 } });
    vi.mocked(bettingAccess).mockResolvedValue({ allowed: true, staff: true, inconclusive: false });

    const result = await getBettingUser();

    expect(rpc).toHaveBeenCalledWith("grant_signup_bonus", {
      p_user: "42",
      p_username: "Zed",
      p_avatar: "https://cdn/x.png",
      p_amount: 1000,
      p_profile_id: "p1",
    });
    expect(result).toEqual({
      discordId: "42",
      profileId: "p1",
      username: "Zed",
      balance: 1500,
      allowed: true,
      staff: true,
    });
  });

  it("falls back through metadata fields, then the discord id, for the username", async () => {
    getUser.mockResolvedValue({
      data: {
        user: { id: "p1", identities: [{ provider: "discord", id: "42" }], user_metadata: {} },
      },
    });
    single.mockResolvedValue({ data: null });

    const result = await getBettingUser();

    expect(result?.username).toBe("42");
    expect(result?.balance).toBe(0);
  });

  it("logs (but does not throw or block) when grant_signup_bonus errors", async () => {
    getUser.mockResolvedValue({
      data: {
        user: { id: "p1", identities: [{ provider: "discord", id: "42" }], user_metadata: {} },
      },
    });
    rpc.mockResolvedValue({ data: null, error: { message: "connection reset" } });
    single.mockResolvedValue({ data: { balance: 250 } });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await getBettingUser();

    expect(errorSpy).toHaveBeenCalledWith("betting: grant_signup_bonus failed", { message: "connection reset" });
    expect(result?.balance).toBe(250);
    errorSpy.mockRestore();
  });

  it("prefers custom_claims.global_name over the plain name field", async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "p1",
          identities: [{ provider: "discord", id: "42" }],
          user_metadata: { name: "fallback-name", custom_claims: { global_name: "Zed" } },
        },
      },
    });

    const result = await getBettingUser();

    expect(result?.username).toBe("Zed");
  });
});

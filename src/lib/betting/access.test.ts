import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getUser } = vi.hoisted(() => ({
  getUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(async () => ({ auth: { getUser } })),
}));

const { serviceSingle, serviceFrom } = vi.hoisted(() => {
  const serviceSingle = vi.fn();
  const serviceFrom = vi.fn(() => ({
    select: vi.fn(() => ({ eq: vi.fn(() => ({ single: serviceSingle })) })),
  }));
  return { serviceSingle, serviceFrom };
});

vi.mock("./service-client", () => ({
  createBettingServiceClient: vi.fn(() => ({ from: serviceFrom })),
}));

import { _clearMemberCache, bettingAccess, fetchGuildMember, requireBettingStaff } from "./access";

const ORIGINAL_ENV = { ...process.env };

function jsonResponse(status: number, body: unknown): Response {
  return { status, json: async () => body } as Response;
}

beforeEach(() => {
  _clearMemberCache();
  process.env = { ...ORIGINAL_ENV, DISCORD_GUILD_ID: "g1", DISCORD_BOT_TOKEN: "BTOKEN" };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchGuildMember", () => {
  it("returns roles on a 200", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { roles: ["r1", "r2"] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchGuildMember("42");

    expect(result).toEqual({ inGuild: true, roles: ["r1", "r2"] });
    expect(fetchMock).toHaveBeenCalledWith("https://discord.com/api/v10/guilds/g1/members/42", {
      headers: { Authorization: "Bot BTOKEN" },
      signal: expect.any(AbortSignal),
    });
  });

  it("bounds the request with a timeout signal", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { roles: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchGuildMember("42");

    const [, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("treats a timeout/abort the same as any other network failure (inconclusive)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation was aborted.", "TimeoutError");
      }),
    );

    const result = await fetchGuildMember("42");

    expect(result).toBeNull();
  });

  it("returns not-in-guild on a 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(404, { message: "Unknown Member" })),
    );

    const result = await fetchGuildMember("42");

    expect(result).toEqual({ inGuild: false, roles: [] });
  });

  it("returns null (inconclusive) on a 500", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(500, {})),
    );

    const result = await fetchGuildMember("42");

    expect(result).toBeNull();
  });

  it("returns null (inconclusive) on a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const result = await fetchGuildMember("42");

    expect(result).toBeNull();
  });

  it("caches a result for 60s — a second call in the window makes no new fetch", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { roles: ["r1"] }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchGuildMember("42");
    await fetchGuildMember("42");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-fetches once the 60s cache entry has expired", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { roles: ["r1"] }));
    vi.stubGlobal("fetch", fetchMock);
    const now = vi.spyOn(Date, "now");

    now.mockReturnValue(1_000_000);
    await fetchGuildMember("42"); // caches at t=1,000,000

    now.mockReturnValue(1_000_000 + 60_000 - 1);
    await fetchGuildMember("42"); // still within the 60s window
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1_000_000 + 60_000 + 1);
    await fetchGuildMember("42"); // past the window — re-fetches
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("bettingAccess", () => {
  beforeEach(() => {
    process.env.DISCORD_REQUIRED_ROLE_ID = "required-role";
    process.env.DISCORD_STAFF_ROLE_ID = "staff-role";
  });

  it("allows and marks staff when the member holds both roles", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { roles: ["required-role", "staff-role"] })),
    );

    expect(await bettingAccess("42")).toEqual({ allowed: true, staff: true, inconclusive: false });
  });

  it("denies when the member lacks the required role", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { roles: ["some-other-role"] })),
    );

    expect(await bettingAccess("42")).toEqual({
      allowed: false,
      staff: false,
      inconclusive: false,
    });
  });

  it("denies when the discord id isn't in the guild", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(404, {})),
    );

    expect(await bettingAccess("42")).toEqual({
      allowed: false,
      staff: false,
      inconclusive: false,
    });
  });

  it("fails open (allowed, inconclusive) when Discord is unreachable", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(503, {})),
    );

    expect(await bettingAccess("42")).toEqual({
      allowed: true,
      staff: false,
      inconclusive: true,
    });
    expect(warnSpy).toHaveBeenCalled();
  });

  it("opens the gate entirely when DISCORD_REQUIRED_ROLE_ID is unset", async () => {
    delete process.env.DISCORD_REQUIRED_ROLE_ID;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { roles: [] })),
    );

    expect((await bettingAccess("42")).allowed).toBe(true);
  });

  it("opens the gate entirely (no Discord call) when guild/bot token aren't configured", async () => {
    delete process.env.DISCORD_GUILD_ID;
    delete process.env.DISCORD_BOT_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await bettingAccess("42")).toEqual({
      allowed: true,
      staff: false,
      inconclusive: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("requireBettingStaff", () => {
  beforeEach(() => {
    process.env.DISCORD_STAFF_ROLE_ID = "staff-role";
    getUser.mockReset();
    serviceSingle.mockReset();
    serviceFrom.mockClear();
  });

  it("returns the caller's identity for a Discord-staff user, without a profiles lookup", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "profile-1", identities: [{ provider: "discord", id: "42" }] } },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { roles: ["staff-role"] })),
    );

    const result = await requireBettingStaff();

    expect(result).toEqual({ discordId: "42", profileId: "profile-1" });
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it("returns the caller's identity for a site admin without the Discord staff role", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "profile-1", identities: [{ provider: "discord", id: "42" }] } },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { roles: [] })),
    );
    serviceSingle.mockResolvedValue({ data: { is_admin: true } });

    expect(await requireBettingStaff()).toEqual({ discordId: "42", profileId: "profile-1" });
  });

  it("throws for a signed-in non-staff, non-admin user", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "profile-1", identities: [{ provider: "discord", id: "42" }] } },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { roles: [] })),
    );
    serviceSingle.mockResolvedValue({ data: { is_admin: false } });

    await expect(requireBettingStaff()).rejects.toThrow("betting: staff only");
  });

  it("throws when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    await expect(requireBettingStaff()).rejects.toThrow("betting: staff only");
  });

  it("throws when the signed-in user has no linked Discord identity", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "profile-1", identities: [] } } });

    await expect(requireBettingStaff()).rejects.toThrow("betting: staff only");
  });
});

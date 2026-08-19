import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// access.ts is `import "server-only"` — same stub as the betting tests.
vi.mock("server-only", () => ({}));

const { getUserMock, fetchStaffTierMock, fetchGuildMemberMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  fetchStaffTierMock: vi.fn(),
  fetchGuildMemberMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ auth: { getUser: getUserMock } }),
}));
vi.mock("@/lib/auth/staffTier", () => ({ fetchStaffTier: fetchStaffTierMock }));
vi.mock("@/lib/betting/access", () => ({ fetchGuildMember: fetchGuildMemberMock }));

import { drafterAccess } from "./access";

function signedInAs(discordId: string | null) {
  getUserMock.mockResolvedValue({
    data: {
      user: {
        id: "profile-1",
        identities: discordId ? [{ provider: "discord", id: discordId }] : [],
      },
    },
  });
}

describe("drafterAccess", () => {
  beforeEach(() => {
    vi.stubEnv("DISCORD_BOT_TOKEN", "bot-token");
    fetchStaffTierMock.mockResolvedValue({ isAdmin: false, isOwner: false });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("denies signed-out visitors", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    expect(await drafterAccess()).toEqual({ signedIn: false, allowed: false, inconclusive: false });
  });

  it("allows premium-role holders in the premium guild", async () => {
    signedInAs("discord-1");
    fetchGuildMemberMock.mockResolvedValue({ inGuild: true, roles: ["1534328431997620234"] });

    expect(await drafterAccess()).toEqual({ signedIn: true, allowed: true, inconclusive: false });
    expect(fetchGuildMemberMock).toHaveBeenCalledWith("discord-1", "1534318803318739146");
  });

  it("denies guild members without the premium role, and non-members", async () => {
    signedInAs("discord-1");
    fetchGuildMemberMock.mockResolvedValue({ inGuild: true, roles: ["other-role"] });
    expect((await drafterAccess()).allowed).toBe(false);

    fetchGuildMemberMock.mockResolvedValue({ inGuild: false, roles: [] });
    expect((await drafterAccess()).allowed).toBe(false);
  });

  it("lets site admins through without the Discord check", async () => {
    signedInAs(null);
    fetchStaffTierMock.mockResolvedValue({ isAdmin: true, isOwner: false });

    expect(await drafterAccess()).toEqual({ signedIn: true, allowed: true, inconclusive: false });
    expect(fetchGuildMemberMock).not.toHaveBeenCalled();
  });

  it("fails open when Discord is inconclusive, closed for accounts without Discord", async () => {
    signedInAs("discord-1");
    fetchGuildMemberMock.mockResolvedValue(null);
    expect(await drafterAccess()).toEqual({ signedIn: true, allowed: true, inconclusive: true });

    signedInAs(null);
    expect((await drafterAccess()).allowed).toBe(false);
  });
});

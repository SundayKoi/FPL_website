import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHomepageFeaturedSettings, fetchHomepageMode } from "./homepageSettings";

const { createServerSupabase } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase }));

function query(result: unknown) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    single: () => Promise.resolve(result),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}

afterEach(() => createServerSupabase.mockReset());

describe("fetchHomepageMode", () => {
  it("returns the persisted mode when it is valid", async () => {
    createServerSupabase.mockResolvedValue({
      from: vi.fn(() => query({ data: { homepage_mode: "regular" }, error: null })),
    });

    await expect(fetchHomepageMode()).resolves.toBe("regular");
  });

  it("falls back to automatic mode for missing or invalid settings", async () => {
    createServerSupabase.mockResolvedValue({
      from: vi.fn(() => query({ data: { homepage_mode: "unexpected" }, error: null })),
    });
    await expect(fetchHomepageMode()).resolves.toBe("auto");

    createServerSupabase.mockResolvedValue({
      from: vi.fn(() => query({ data: null, error: { code: "PGRST116" } })),
    });
    await expect(fetchHomepageMode()).resolves.toBe("auto");
  });
});

describe("fetchHomepageFeaturedSettings", () => {
  it.each([
    [
      "premier",
      {
        fixture_id: "5b2e9d9f-d24f-4649-8809-9d057b6c9a39",
        title: "Premier Match of the Week",
        description: "Two contenders meet under the lights.",
        twitch_url: "https://www.twitch.tv/franchisepremierleague",
      },
      {
        fixtureId: "5b2e9d9f-d24f-4649-8809-9d057b6c9a39",
        title: "Premier Match of the Week",
        description: "Two contenders meet under the lights.",
        twitchUrl: "https://www.twitch.tv/franchisepremierleague",
      },
    ],
    [
      "academy",
      {
        fixture_id: "1a370346-ba2a-4c02-b05d-a820c01820e8",
        title: "Academy Spotlight",
        description: "Tomorrow's stars take the stage.",
        twitch_url: "https://www.twitch.tv/jakeok1",
      },
      {
        fixtureId: "1a370346-ba2a-4c02-b05d-a820c01820e8",
        title: "Academy Spotlight",
        description: "Tomorrow's stars take the stage.",
        twitchUrl: "https://www.twitch.tv/jakeok1",
      },
    ],
  ] as const)("returns the persisted %s settings", async (homepage, row, expected) => {
    const settingsQuery = query({ data: row, error: null });
    const from = vi.fn(() => settingsQuery);
    createServerSupabase.mockResolvedValue({
      from,
    });

    await expect(fetchHomepageFeaturedSettings(homepage)).resolves.toEqual(expected);
    expect(from).toHaveBeenCalledWith("homepage_featured_settings");
    expect(settingsQuery.select).toHaveBeenCalledWith("fixture_id, title, description, twitch_url");
    expect(settingsQuery.eq).toHaveBeenCalledWith("homepage", homepage);
  });

  it("falls back to nulls for missing or invalid settings", async () => {
    createServerSupabase.mockResolvedValue({
      from: vi.fn(() => query({ data: null, error: { code: "PGRST116" } })),
    });

    await expect(fetchHomepageFeaturedSettings("premier")).resolves.toEqual({
      fixtureId: null,
      title: null,
      description: null,
      twitchUrl: null,
    });

    createServerSupabase.mockResolvedValue({
      from: vi.fn(() => query({
        data: {
        fixture_id: 42,
        title: "   ",
        description: {},
        twitch_url: [],
        },
        error: null,
      })),
    });

    await expect(fetchHomepageFeaturedSettings("academy")).resolves.toEqual({
      fixtureId: null,
      title: null,
      description: null,
      twitchUrl: null,
    });
  });
});

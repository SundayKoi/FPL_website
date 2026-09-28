import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabase, mockSupabase } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  mockSupabase: { from: vi.fn() },
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase }));

import { fetchTeamIdentities } from "./identity";

function queryBuilder(result: { data: unknown; error: null }) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(async () => result),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  createServerSupabase.mockResolvedValue(mockSupabase);
});

describe("fetchTeamIdentities", () => {
  it.each([
    [undefined, "featured_draft_id", "premier-draft", "Premier Crest"],
    ["academy_draft_id", "academy_draft_id", "academy-draft", "Academy Crest"],
  ] as const)("uses the %s league draft for fixture crest identity", async (requestedColumn, expectedColumn, draftId, crest) => {
    const settings = queryBuilder({ data: { [expectedColumn]: draftId }, error: null });
    const teams = queryBuilder({
      data: [{ name: "Shared Name", abbreviation: "SHR", image_url: crest }],
      error: null,
    });
    mockSupabase.from.mockImplementation((table: string) => table === "league_settings" ? settings : teams);

    const identities = await fetchTeamIdentities(requestedColumn);

    expect(settings.select).toHaveBeenCalledWith(expectedColumn);
    expect(settings.eq).toHaveBeenCalledWith("id", 1);
    expect(teams.select).toHaveBeenCalledWith("name, abbreviation, image_url");
    expect(teams.eq).toHaveBeenCalledWith("draft_id", draftId);
    expect(identities).toEqual({
      "shared-name": { name: "Shared Name", abbreviation: "SHR", imageUrl: crest },
    });
  });

  it("does not issue an unscoped team query when that league has no draft", async () => {
    const settings = queryBuilder({ data: { featured_draft_id: null }, error: null });
    mockSupabase.from.mockReturnValue(settings);

    await expect(fetchTeamIdentities()).resolves.toEqual({});
    expect(mockSupabase.from).toHaveBeenCalledTimes(1);
  });
});

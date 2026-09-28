import { afterEach, describe, expect, it, vi } from "vitest";

const { createServerSupabase } = vi.hoisted(() => ({ createServerSupabase: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase }));

import { fetchTeamIdentities } from "./identity";

type TeamRow = {
  draft_id: string;
  name: string;
  abbreviation: string | null;
  image_url: string | null;
  banner_color: string | null;
};

function client(drafts: Record<string, string | null>, rows: TeamRow[]) {
  const settingsEqCalls: Array<[string, number]> = [];
  const settingsSelect = vi.fn((column: string) => {
    const query = {
      eq: vi.fn((filterColumn: string, value: number) => {
        settingsEqCalls.push([filterColumn, value]);
        return query;
      }),
      single: vi.fn(async () => ({ data: { [column]: drafts[column] } })),
    };
    return query;
  });
  const teamsEq = vi.fn(async (_column: string, draftId: string) => ({
    data: rows.filter((row) => row.draft_id === draftId),
  }));
  const teamsSelect = vi.fn(() => ({ eq: teamsEq }));
  const from = vi.fn((table: string) => table === "league_settings"
    ? { select: settingsSelect }
    : { select: teamsSelect });

  return { from, settingsEqCalls, settingsSelect, teamsEq, teamsSelect };
}

afterEach(() => createServerSupabase.mockReset());

describe("fetchTeamIdentities", () => {
  it("resolves same-named teams from each league's own draft and preserves saved identity", async () => {
    const db = client(
      { featured_draft_id: "premier", academy_draft_id: "academy" },
      [
        { draft_id: "premier", name: "Shared Name", abbreviation: "PRE", image_url: "premier.svg", banner_color: " #AABBCC " },
        { draft_id: "academy", name: "Shared Name", abbreviation: "ACA", image_url: "academy.svg", banner_color: "#102030" },
      ],
    );
    createServerSupabase.mockResolvedValue(db);

    expect((await fetchTeamIdentities())["shared-name"]).toEqual({
      name: "Shared Name",
      abbreviation: "PRE",
      imageUrl: "premier.svg",
      bannerColor: "#aabbcc",
    });
    expect((await fetchTeamIdentities("academy_draft_id"))["shared-name"]).toEqual({
      name: "Shared Name",
      abbreviation: "ACA",
      imageUrl: "academy.svg",
      bannerColor: "#102030",
    });

    expect(db.settingsSelect).toHaveBeenNthCalledWith(1, "featured_draft_id");
    expect(db.settingsSelect).toHaveBeenNthCalledWith(2, "academy_draft_id");
    expect(db.settingsEqCalls).toEqual([["id", 1], ["id", 1]]);
    expect(db.teamsSelect).toHaveBeenCalledWith("name, abbreviation, image_url, banner_color");
    expect(db.teamsEq).toHaveBeenNthCalledWith(1, "draft_id", "premier");
    expect(db.teamsEq).toHaveBeenNthCalledWith(2, "draft_id", "academy");
  });

  it("does not issue an unscoped team query when the selected league has no draft", async () => {
    const db = client({ featured_draft_id: null }, []);
    createServerSupabase.mockResolvedValue(db);

    await expect(fetchTeamIdentities()).resolves.toEqual({});
    expect(db.from).toHaveBeenCalledTimes(1);
    expect(db.teamsSelect).not.toHaveBeenCalled();
  });

  it("falls back for a missing abbreviation and invalid banner color", async () => {
    const db = client(
      { featured_draft_id: "premier" },
      [{ draft_id: "premier", name: "Brave Wolves", abbreviation: null, image_url: null, banner_color: "red" }],
    );
    createServerSupabase.mockResolvedValue(db);

    expect((await fetchTeamIdentities())["brave-wolves"]).toMatchObject({
      abbreviation: "BRA",
      imageUrl: null,
      bannerColor: "#083344",
    });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTeamIdentities } from "./identity";

const { createServerSupabase } = vi.hoisted(() => ({ createServerSupabase: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase }));

function client(drafts: Record<string, string | null>, rows: Record<string, unknown>[]) {
  const settings = {
    select: vi.fn((column: string) => {
      const query = {
        eq: vi.fn(() => query),
        single: vi.fn(async () => ({ data: { [column]: drafts[column] } })),
      };
      return query;
    }),
  };
  const teams = {
    select: vi.fn((columns: string) => {
      expect(columns).toContain("banner_color");
      return { eq: vi.fn(async (_column: string, draftId: string) => ({ data: rows.filter((row) => row.draft_id === draftId) })) };
    }),
  };
  return { from: vi.fn((table: string) => table === "league_settings" ? settings : teams) };
}

afterEach(() => createServerSupabase.mockReset());

describe("fetchTeamIdentities", () => {
  it("loads each draft separately, retaining its saved color and original logo", async () => {
    const db = client(
      { featured_draft_id: "premier", academy_draft_id: "academy" },
      [
        { draft_id: "premier", name: "Shared Name", abbreviation: "PRE", image_url: "premier.svg", banner_color: " #AABBCC " },
        { draft_id: "academy", name: "Shared Name", abbreviation: "ACA", image_url: "academy.svg", banner_color: "#102030" },
      ],
    );
    createServerSupabase.mockResolvedValue(db);
    expect((await fetchTeamIdentities())["shared-name"]).toEqual({ name: "Shared Name", abbreviation: "PRE", imageUrl: "premier.svg", bannerColor: "#aabbcc" });
    expect((await fetchTeamIdentities("academy_draft_id"))["shared-name"]).toEqual({ name: "Shared Name", abbreviation: "ACA", imageUrl: "academy.svg", bannerColor: "#102030" });
  });

  it("falls back for invalid color and abbreviation", async () => {
    createServerSupabase.mockResolvedValue(client({ featured_draft_id: "premier" }, [
      { draft_id: "premier", name: "Brave Wolves", abbreviation: null, image_url: null, banner_color: "red" },
    ]));
    expect((await fetchTeamIdentities())["brave-wolves"]).toMatchObject({ abbreviation: "BRA", bannerColor: "#083344" });
  });
});

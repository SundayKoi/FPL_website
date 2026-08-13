import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHomepageMode } from "./homepageSettings";

const { createServerSupabase } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase }));

function query(result: unknown) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    single: () => Promise.resolve(result),
  };
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

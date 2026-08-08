import { describe, expect, it, vi } from "vitest";
import { fetchServerOffset, remainingMs } from "./time";

describe("remainingMs", () => {
  it("computes remaining against server time", () => {
    const closes = new Date(10_000).toISOString();
    expect(remainingMs(closes, 0, 4_000)).toBe(6_000);
  });
  it("applies the offset (client clock behind server)", () => {
    const closes = new Date(10_000).toISOString();
    expect(remainingMs(closes, 2_000, 4_000)).toBe(4_000);
  });
  it("clamps at zero", () => {
    expect(remainingMs(new Date(1_000).toISOString(), 0, 5_000)).toBe(0);
  });
});

describe("fetchServerOffset", () => {
  it("returns server minus client ms", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: new Date(3_000).toISOString(), error: null }),
    };
    expect(await fetchServerOffset(supabase as never)).toBe(2_000);
    vi.restoreAllMocks();
  });
});

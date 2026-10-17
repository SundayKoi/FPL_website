import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OffseasonEvent } from "./types";

const { fetchLatestEvent } = vi.hoisted(() => ({ fetchLatestEvent: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({})) }));
vi.mock("./queries", () => ({ fetchLatestEvent }));

import { fetchHomeOffseasonEvent } from "./home";

const event = (overrides: Partial<OffseasonEvent>): OffseasonEvent => ({
  id: "event",
  name: "FPL Offseason Tournament",
  status: "running",
  signups_open: false,
  yardstick_season: "S6",
  created_at: "2026-10-01T00:00:00Z",
  ...overrides,
});

beforeEach(() => {
  fetchLatestEvent.mockReset();
});

describe("fetchHomeOffseasonEvent", () => {
  it("returns the newest event while it runs", async () => {
    fetchLatestEvent.mockResolvedValue(event({ status: "signups", signups_open: true }));
    await expect(fetchHomeOffseasonEvent()).resolves.toEqual({ name: "FPL Offseason Tournament", status: "signups", signups_open: true });
  });

  it("hides a complete event, a missing one, and a failed read", async () => {
    fetchLatestEvent.mockResolvedValue(event({ status: "complete" }));
    await expect(fetchHomeOffseasonEvent()).resolves.toBeNull();
    fetchLatestEvent.mockResolvedValue(null);
    await expect(fetchHomeOffseasonEvent()).resolves.toBeNull();
    fetchLatestEvent.mockRejectedValue(new Error("offline"));
    await expect(fetchHomeOffseasonEvent()).resolves.toBeNull();
  });
});

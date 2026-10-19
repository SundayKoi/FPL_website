import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OffseasonEvent } from "./types";

const { fetchLatestEvent, latestWeek } = vi.hoisted(() => ({ fetchLatestEvent: vi.fn(), latestWeek: vi.fn() }));
// The latest-week read: from().select().eq().order().limit().maybeSingle().
vi.mock("@/lib/supabase/server", () => {
  const query = { select: () => query, eq: () => query, order: () => query, limit: () => query, maybeSingle: () => latestWeek() };
  return { createServerSupabase: vi.fn(async () => ({ from: () => query })) };
});
vi.mock("./queries", () => ({ fetchLatestEvent }));

import { fetchHomeOffseasonEvent, fetchOffseasonRunning } from "./home";

const event = (overrides: Partial<OffseasonEvent>): OffseasonEvent => ({
  id: "event",
  name: "FPL Offseason Tournament",
  status: "running",
  signups_open: false,
  yardstick_season: "S6",
  created_at: "2026-10-01T00:00:00Z",
  ...overrides,
});

const SATURDAY = Date.parse("2026-10-17T16:00:00Z");

beforeEach(() => {
  fetchLatestEvent.mockReset();
  latestWeek.mockReset();
  latestWeek.mockResolvedValue({ data: null, error: null });
});

describe("fetchHomeOffseasonEvent", () => {
  it("returns the newest event while it runs", async () => {
    fetchLatestEvent.mockResolvedValue(event({ status: "signups", signups_open: true }));
    await expect(fetchHomeOffseasonEvent(SATURDAY)).resolves.toEqual({
      name: "FPL Offseason Tournament",
      status: "signups",
      signups_open: true,
      next: null,
    });
  });

  it("names what the latest week does next", async () => {
    fetchLatestEvent.mockResolvedValue(event({}));
    latestWeek.mockResolvedValue({ data: { week_number: 1, draft_at: "2026-10-19T00:00:00Z", games_at: "2026-10-20T00:00:00Z" }, error: null });
    await expect(fetchHomeOffseasonEvent(SATURDAY)).resolves.toMatchObject({ next: { kind: "draft", weekNumber: 1, at: "2026-10-19T00:00:00Z" } });
  });

  it("hides a complete event, a missing one, and a failed read", async () => {
    fetchLatestEvent.mockResolvedValue(event({ status: "complete" }));
    await expect(fetchHomeOffseasonEvent()).resolves.toBeNull();
    fetchLatestEvent.mockResolvedValue(null);
    await expect(fetchHomeOffseasonEvent()).resolves.toBeNull();
    fetchLatestEvent.mockRejectedValue(new Error("offline"));
    await expect(fetchHomeOffseasonEvent()).resolves.toBeNull();
    fetchLatestEvent.mockResolvedValue(event({}));
    latestWeek.mockResolvedValue({ data: null, error: { message: "offline" } });
    await expect(fetchHomeOffseasonEvent()).resolves.toBeNull();
  });
});

describe("fetchOffseasonRunning", () => {
  it("is true while the newest event runs", async () => {
    fetchLatestEvent.mockResolvedValue(event({ status: "signups" }));
    await expect(fetchOffseasonRunning()).resolves.toBe(true);
  });

  it("is false once the event is complete, with no event, or when the read fails", async () => {
    fetchLatestEvent.mockResolvedValue(event({ status: "complete" }));
    await expect(fetchOffseasonRunning()).resolves.toBe(false);
    fetchLatestEvent.mockResolvedValue(null);
    await expect(fetchOffseasonRunning()).resolves.toBe(false);
    fetchLatestEvent.mockRejectedValue(new Error("offline"));
    await expect(fetchOffseasonRunning()).resolves.toBe(false);
  });
});

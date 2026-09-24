import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAP_FIXTURE_KEYS } from "@/lib/expeditions/mapFixtures";

const { fetchStaffTier, redirect } = vi.hoisted(() => ({ fetchStaffTier: vi.fn(), redirect: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/staffTier", () => ({ fetchStaffTier }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({})) }));

const Preview = (await import("./page")).default;
const open = (params: Record<string, string> = {}) => Preview({ searchParams: Promise.resolve(params) });

beforeEach(() => {
  fetchStaffTier.mockReset().mockResolvedValue({ isAdmin: false, isOwner: false, isBroadcaster: false });
  redirect.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the expedition map preview", () => {
  it("turns away anyone who isn't staff outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await open({ state: "fog", tier: "legend" });
    expect(redirect).toHaveBeenCalledWith("/admin");
  });

  it("opens for staff in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: true, isBroadcaster: false });
    render(await open({ state: "fog", tier: "legend" }));
    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByTestId("living-map")).toBeTruthy();
  });

  it("draws the index of every chart in development, without asking who is looking", async () => {
    vi.stubEnv("NODE_ENV", "development");
    render(await open());
    expect(fetchStaffTier).not.toHaveBeenCalled();
    const index = screen.getByTestId("map-index");
    for (const { state, tier } of MAP_FIXTURE_KEYS) {
      const card = within(index).getByTestId(`map-fixture-${state}-${tier}`);
      expect(within(card).getByTestId("living-map").getAttribute("data-tier")).toBe(tier);
    }
  });

  it("draws one chart from ?state=&tier=, in a forced frame when asked", async () => {
    vi.stubEnv("NODE_ENV", "development");
    render(await open({ state: "storm", tier: "mythic", layout: "phone", motion: "reduce" }));
    const preview = screen.getByTestId("map-preview");
    expect(preview.getAttribute("data-state")).toBe("storm");
    const map = within(preview).getByTestId("living-map");
    expect(map.getAttribute("data-tier")).toBe("mythic");
    expect(map.getAttribute("data-weather")).toBe("watch");
    expect(map.getAttribute("data-layout")).toBe("phone");
    expect(map.getAttribute("data-reduced-motion")).toBe("true");
    expect(screen.queryByTestId("map-index")).toBeNull();
  });

  it("falls back to a real chart for a state or route it does not know", async () => {
    vi.stubEnv("NODE_ENV", "development");
    render(await open({ state: "sideways", tier: "mythic" }));
    expect(screen.getByTestId("map-preview").getAttribute("data-state")).toBe("mid");
  });
});

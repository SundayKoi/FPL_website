import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchStaffTier, redirect } = vi.hoisted(() => ({ fetchStaffTier: vi.fn(), redirect: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect, useRouter: () => ({ refresh: vi.fn() }) }));
// The fixtures derive each run's view the way the live page does, with
// views.ts — server-only, since it holds the road.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/staffTier", () => ({ fetchStaffTier }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({})) }));
// "use server" pulls in server-only; the preview never calls the real ones.
vi.mock("@/lib/expeditions/actions", () => ({
  launchExpeditionAction: vi.fn(),
  claimExpeditionAction: vi.fn(),
  decideForkAction: vi.fn(),
  ransomLostCardAction: vi.fn(),
  startCampaignAction: vi.fn(),
  abandonCampaignAction: vi.fn(),
  upgradeCampAction: vi.fn(),
  forgePolicyAction: vi.fn(),
  revealRoadAction: vi.fn(),
}));

const Preview = (await import("./page")).default;
const open = (persona?: string) => Preview({ searchParams: Promise.resolve(persona ? { persona } : {}) });

beforeEach(() => {
  fetchStaffTier.mockReset().mockResolvedValue({ isAdmin: false, isOwner: false, isBroadcaster: false });
  redirect.mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the expedition board preview", () => {
  it("turns away anyone who isn't staff outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await open("mid");
    expect(redirect).toHaveBeenCalledWith("/admin");
  });

  it("opens for staff in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    fetchStaffTier.mockResolvedValue({ isAdmin: true, isOwner: false, isBroadcaster: false });
    render(await open("new"));
    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByTestId("expedition-board")).toBeTruthy();
  });

  it("opens in development without asking who is looking", async () => {
    vi.stubEnv("NODE_ENV", "development");
    render(await open());
    expect(fetchStaffTier).not.toHaveBeenCalled();
    // An unknown or missing persona is the newcomer, who gets the guide.
    expect(screen.getByTestId("guide")).toBeTruthy();
  });

  it("draws each persona's board from its fixtures", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const mid = render(await open("mid"));
    expect(screen.getByTestId("fork-301-0")).toBeTruthy();
    expect(screen.getByTestId("run-302")).toBeTruthy();
    mid.unmount();

    render(await open("veteran"));
    expect(screen.getByRole("button", { name: "Claim the Legend Hunt" })).toBeTruthy();
    expect(screen.getByTestId("hold-471")).toBeTruthy();
    expect(screen.queryByTestId("guide")).toBeNull();
  });

  it("shows the road ahead as the squads know it: fog, dread, and a fragment to spend", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const mid = render(await open("mid"));
    // The Deep Raid's second checkpoint is a `?`; the fork it stands at
    // still says what the squad's edges do; a fragment can show the rest.
    const raid = screen.getByTestId("run-301");
    expect(within(raid).getByTestId("map-place-1").getAttribute("data-known")).toBe("false");
    expect(screen.getByTestId("fork-301-0").querySelector("[data-testid^='fork-edges-']")).not.toBeNull();
    expect((screen.getByTestId("reveal-301").querySelector("button") as HTMLButtonElement).disabled).toBe(false);
    mid.unmount();

    render(await open("veteran"));
    const legendary = screen.getByTestId("run-502");
    expect(legendary.querySelectorAll('[data-known="false"]').length).toBeGreaterThan(0);
    expect(legendary.querySelector('[data-known="false"][data-warned="true"] [data-dread]')).not.toBeNull();
    expect(screen.getByTestId("dread-502").textContent).toMatch(/bad feeling about/);
    expect((screen.getByTestId("reveal-502").querySelector("button") as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows the veteran's atlas, and the place another collector named on the mid-game map", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const mid = render(await open("mid"));
    expect(screen.getByTestId("landmark-301-0").textContent).toContain("first reached by Ana");
    mid.unmount();

    render(await open("veteran"));
    fireEvent.click(screen.getByTestId("tab-atlas"));
    expect(screen.getByTestId("atlas")).toBeTruthy();
    expect(screen.getByTestId("atlas-named").textContent).toContain("The empty village");
    expect(screen.getByTestId("atlas-road-scout").textContent).toContain("Walked");
  });
});

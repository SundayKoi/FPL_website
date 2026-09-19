import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ON_AIR_COPIES } from "@/lib/packs/config";

const { fetchStaffTier, redirect, fetchOnAirDesk, countOnAirThisSeason, maybeSingle } = vi.hoisted(() => ({
  fetchStaffTier: vi.fn(),
  redirect: vi.fn(),
  fetchOnAirDesk: vi.fn(),
  countOnAirThisSeason: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/staffTier", () => ({ fetchStaffTier }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(async () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  })),
}));
vi.mock("@/lib/cards/onAirQueries", () => ({ fetchOnAirDesk, countOnAirThisSeason }));
vi.mock("@/components/cards/PlayerCard3D", () => ({
  // The card comes back out as attributes so the page can be checked for
  // what it actually hands the renderer — who, which number, which art —
  // without rendering a line of CSS.
  default: ({ card }: { card: { name: string; serial: number; signature: { champion: string } | null; role: string } }) => (
    <div data-testid="card" data-name={card.name} data-serial={card.serial} data-role={card.role} data-champion={card.signature?.champion ?? ""} />
  ),
}));
vi.mock("@/components/admin/OnAirCasterForm", () => ({
  default: ({ profileId, champion, active }: { profileId: string; champion: string | null; active: boolean }) => (
    <div data-testid="caster-form" data-profile={profileId} data-champion={champion ?? ""} data-active={String(active)} />
  ),
}));

const OnAirAdminPage = (await import("./page")).default;

const deskRow = (over: Record<string, unknown> = {}) => ({
  caster: { profileId: "a", name: "Static", champion: "Bard", skin: 3, roleLabel: "Play-by-play", tagline: null },
  active: true,
  hasRow: true,
  ...over,
});

beforeEach(() => {
  redirect.mockReset();
  fetchStaffTier.mockResolvedValue({ isAdmin: true, isOwner: false, isBroadcaster: false });
  fetchOnAirDesk.mockResolvedValue([]);
  countOnAirThisSeason.mockResolvedValue({});
  maybeSingle.mockResolvedValue({ data: { current_season: "S5" } });
});
afterEach(cleanup);

describe("/admin/on-air", () => {
  it("sends a visitor who is not staff back to the admin hub", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: false, isBroadcaster: true });

    render(await OnAirAdminPage());

    expect(redirect).toHaveBeenCalledWith("/admin");
  });

  it("draws one row per broadcaster: the next copy, the count and the form", async () => {
    fetchOnAirDesk.mockResolvedValue([
      deskRow(),
      deskRow({ caster: { profileId: "b", name: "Mixdown", champion: null, skin: 0, roleLabel: "Colour", tagline: null }, active: false, hasRow: false }),
    ]);
    countOnAirThisSeason.mockResolvedValue({ a: 4 });

    render(await OnAirAdminPage());

    expect(screen.getByTestId("on-air-caster-a")).toBeTruthy();
    expect(screen.getByTestId("on-air-caster-b")).toBeTruthy();
    // The preview is the NEXT copy: four minted, so the fifth.
    const preview = screen.getByTestId("on-air-caster-a").querySelector('[data-testid="card"]')!;
    expect(preview.getAttribute("data-name")).toBe("Static");
    expect(preview.getAttribute("data-serial")).toBe("5");
    expect(preview.getAttribute("data-champion")).toBe("Bard");
    expect(screen.getByText(`4 of ${ON_AIR_COPIES} minted this season`)).toBeTruthy();
    // A caster who has never printed starts at #1.
    expect(screen.getByTestId("on-air-caster-b").querySelector('[data-testid="card"]')!.getAttribute("data-serial")).toBe("1");
    expect(screen.getByText("Out of the pool")).toBeTruthy();

    const forms = screen.getAllByTestId("caster-form");
    expect(forms.map((form) => form.getAttribute("data-profile"))).toEqual(["a", "b"]);
    expect(forms[0].getAttribute("data-champion")).toBe("Bard");
    expect(forms[1].getAttribute("data-active")).toBe("false");
  });

  it("draws both specimens, with art and without", async () => {
    render(await OnAirAdminPage());

    const withArt = screen.getByTestId("on-air-specimen").querySelector('[data-testid="card"]')!;
    const without = screen.getByTestId("on-air-specimen-no-signal").querySelector('[data-testid="card"]')!;
    expect(withArt.getAttribute("data-champion")).toBe("Bard");
    expect(without.getAttribute("data-champion")).toBe("");
  });

  it("says so when nobody is a broadcaster", async () => {
    render(await OnAirAdminPage());

    expect(screen.getByTestId("on-air-empty").textContent).toContain("Nobody is marked broadcaster yet");
    expect(screen.queryByTestId("caster-form")).toBeNull();
  });
});

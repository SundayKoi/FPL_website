import { afterEach, describe, expect, it, vi } from "vitest";

const { redirect, serverClient, loadMyTeamDashboard } = vi.hoisted(() => ({
  redirect: vi.fn(),
  serverClient: { from: vi.fn() },
  loadMyTeamDashboard: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => serverClient) }));
vi.mock("@/lib/my-team/queries", () => ({ loadMyTeamDashboard }));

import CaptainPage from "./page";
import AcademyCaptainPage from "@/app/academy/captain/page";

function ready(isAdmin: boolean, teamId: string) {
  return { kind: "ready", isAdmin, team: { id: teamId } };
}

afterEach(() => vi.clearAllMocks());

describe("legacy Captain routes", () => {
  it("redirects both league hubs to their exact canonical routes", async () => {
    await CaptainPage({ searchParams: Promise.resolve({}) });
    await AcademyCaptainPage({ searchParams: Promise.resolve({}) });

    expect(redirect).toHaveBeenNthCalledWith(1, "/my-team");
    expect(redirect).toHaveBeenNthCalledWith(2, "/academy/my-team");
    expect(loadMyTeamDashboard).not.toHaveBeenCalled();
  });

  it("preserves only a server-validated admin team override", async () => {
    loadMyTeamDashboard.mockResolvedValue(ready(true, "team-2"));

    await CaptainPage({ searchParams: Promise.resolve({ team: "team-2" }) });

    expect(loadMyTeamDashboard).toHaveBeenCalledWith(serverClient, "premier", "team-2");
    expect(redirect).toHaveBeenCalledWith("/my-team?team=team-2");
  });

  it("drops player and captain team overrides from the redirect", async () => {
    loadMyTeamDashboard.mockResolvedValue(ready(false, "team-2"));

    await CaptainPage({ searchParams: Promise.resolve({ team: "team-2" }) });

    expect(redirect).toHaveBeenCalledWith("/my-team");
  });
});

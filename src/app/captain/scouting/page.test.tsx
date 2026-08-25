import { afterEach, describe, expect, it, vi } from "vitest";

const { redirect, serverClient, loadMyTeamDashboard } = vi.hoisted(() => ({
  redirect: vi.fn(),
  serverClient: { from: vi.fn() },
  loadMyTeamDashboard: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => serverClient) }));
vi.mock("@/lib/my-team/queries", () => ({ loadMyTeamDashboard }));

import CaptainScoutingPage from "./page";
import AcademyCaptainScoutingPage from "@/app/academy/captain/scouting/page";

function ready(isAdmin: boolean, teamId: string) {
  return { kind: "ready", isAdmin, team: { id: teamId } };
}

afterEach(() => vi.clearAllMocks());

describe("legacy Captain scouting routes", () => {
  it("redirects both league scouting pages to their exact canonical routes", async () => {
    await CaptainScoutingPage({ searchParams: Promise.resolve({}) });
    await AcademyCaptainScoutingPage({ searchParams: Promise.resolve({}) });

    expect(redirect).toHaveBeenNthCalledWith(1, "/my-team/scouting");
    expect(redirect).toHaveBeenNthCalledWith(2, "/academy/my-team/scouting");
    expect(loadMyTeamDashboard).not.toHaveBeenCalled();
  });

  it("preserves a validated Academy admin team override", async () => {
    loadMyTeamDashboard.mockResolvedValue(ready(true, "academy-team-2"));

    await AcademyCaptainScoutingPage({
      searchParams: Promise.resolve({ team: ["academy-team-2", "forged"] }),
    });

    expect(loadMyTeamDashboard).toHaveBeenCalledWith(serverClient, "academy", "academy-team-2");
    expect(redirect).toHaveBeenCalledWith("/academy/my-team/scouting?team=academy-team-2");
  });

  it("drops invalid admin overrides from the redirect", async () => {
    loadMyTeamDashboard.mockResolvedValue(ready(true, "team-1"));

    await CaptainScoutingPage({ searchParams: Promise.resolve({ team: "forged-team" }) });

    expect(redirect).toHaveBeenCalledWith("/my-team/scouting");
  });
});

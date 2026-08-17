import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Profile, Team } from "@/lib/draft/types";
import AdminTeamEditor from "./AdminTeamEditor";

const { from, rpc, upload, getPublicUrl, remove, refresh } = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn(),
}));

const publicUrlFor = (objectPath: string) =>
  `https://storage.test/storage/v1/object/public/team-images/${objectPath}`;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from,
    rpc,
    storage: { from: () => ({ upload, getPublicUrl, remove }) },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

type TeamUpdateResult = {
  data: { id: string }[] | null;
  error: { message: string } | null;
};

// The owner-only update no longer chains `.single()` — the component reads
// `data` as the array PostgREST returns and treats an empty array as an RLS
// refusal (a plain admin's UPDATE affects zero rows without raising).
let teamUpdateResult: TeamUpdateResult = { data: [{ id: "team-a" }], error: null };
const teamQuery: {
  update: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  then: PromiseLike<TeamUpdateResult>["then"];
} = {
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  then: (onFulfilled, onRejected) => Promise.resolve(teamUpdateResult).then(onFulfilled, onRejected),
};

teamQuery.update.mockReturnValue(teamQuery);
teamQuery.eq.mockReturnValue(teamQuery);
teamQuery.select.mockReturnValue(teamQuery);
from.mockReturnValue(teamQuery);
rpc.mockResolvedValue({ data: null, error: null });

const teams: Team[] = [
  {
    id: "team-a",
    draft_id: "draft-1",
    name: "Team A",
    abbreviation: "TA",
    captain_profile_id: "profile-a",
    captain_profile_id_2: null,
    image_url: publicUrlFor("draft-1/team-a"),
    banner_color: "#083344",
    division: null,
    nomination_position: 1,
    budget_start: 100,
    points_remaining: 75,
  },
];

const profiles: Profile[] = [
  {
    id: "profile-a",
    discord_id: null,
    display_name: "Captain A",
    avatar_url: null,
    is_admin: false,
  },
  {
    id: "profile-b",
    discord_id: null,
    display_name: "Captain B",
    avatar_url: null,
    is_admin: false,
  },
];

function renderEditor({
  draftId = "draft-1",
  teamRows = teams,
}: {
  draftId?: string;
  teamRows?: Team[];
} = {}) {
  return render(
    <AdminTeamEditor draftId={draftId} teams={teamRows} profiles={profiles}>
      <p>Roster editor content</p>
    </AdminTeamEditor>
  );
}

function configuredUpdate(result: TeamUpdateResult) {
  teamUpdateResult = result;
}

afterEach(() => {
  cleanup();
  from.mockClear();
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
  upload.mockReset();
  upload.mockResolvedValue({ error: null });
  getPublicUrl.mockReset();
  getPublicUrl.mockImplementation((objectPath: string) => ({
    data: { publicUrl: publicUrlFor(objectPath) },
  }));
  remove.mockReset();
  remove.mockResolvedValue({ error: null });
  refresh.mockClear();
  teamQuery.update.mockClear();
  teamQuery.eq.mockClear();
  teamQuery.select.mockClear();
  from.mockReturnValue(teamQuery);
  configuredUpdate({ data: [{ id: "team-a" }], error: null });
});

describe("AdminTeamEditor", () => {
  it("shows children normally and reveals per-team forms only while editing", () => {
    renderEditor();

    expect(screen.getByText("Roster editor content")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit teams" })).toBeTruthy();
    expect(screen.queryByLabelText("Team A name")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Edit teams" }));

    expect(screen.queryByText("Roster editor content")).toBeNull();
    expect(screen.getByLabelText("Team A name")).toBeTruthy();
    expect((screen.getByLabelText("Team A banner color") as HTMLInputElement).value).toBe("#083344");
    expect(screen.getByRole("button", { name: "Done editing teams" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Done editing teams" }));

    expect(screen.getByText("Roster editor content")).toBeTruthy();
  });

  it("saves all teams independently", async () => {
    const secondTeam = { ...teams[0], id: "team-b", name: "Team B", abbreviation: "TB" };
    rpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "Team B failed" } });
    renderEditor({ teamRows: [teams[0], secondTeam] });
    fireEvent.click(screen.getByRole("button", { name: "Edit teams" }));

    fireEvent.click(screen.getByRole("button", { name: "Save all" }));

    expect((await within(screen.getByRole("form", { name: "Edit Team A" })).findByRole("status")).textContent).toContain(
      "Team saved.",
    );
    expect((await within(screen.getByRole("form", { name: "Edit Team B" })).findByRole("status")).textContent).toContain(
      "Team B failed",
    );
    expect(screen.getByRole("region", { name: "Edit teams" })).toBeTruthy();
    // Neither team's name/captain/division changed, so the owner-only write
    // is never attempted.
    expect(teamQuery.update).not.toHaveBeenCalled();
  });

  it("rejects invalid name, abbreviation, and image files before upload", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit teams" }));
    const form = screen.getByRole("form", { name: "Edit Team A" });

    fireEvent.change(within(form).getByLabelText("Team A name"), { target: { value: " " } });
    fireEvent.change(within(form).getByLabelText("Team A abbreviation"), { target: { value: "LONGER" } });
    fireEvent.change(within(form).getByLabelText("Team A image"), {
      target: { files: [new File(["not an image"], "team.txt", { type: "text/plain" })] },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Save Team A" }));

    expect((await within(form).findByRole("status")).textContent).toContain(
      "Enter a team name, an abbreviation of 1–5 characters, a hex banner color, and an allowed image file."
    );
    expect(upload).not.toHaveBeenCalled();

    fireEvent.change(within(form).getByLabelText("Team A name"), { target: { value: "Alpha" } });
    fireEvent.change(within(form).getByLabelText("Team A abbreviation"), { target: { value: "ALP" } });
    fireEvent.change(within(form).getByLabelText("Team A image"), {
      target: {
        files: [new File([new Uint8Array(2 * 1024 * 1024 + 1)], "team.png", { type: "image/png" })],
      },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Save Team A" }));

    expect((await within(form).findByRole("status")).textContent).toContain(
      "Images must be PNG, JPEG, WebP, or GIF files up to 2 MiB."
    );
    expect(upload).not.toHaveBeenCalled();
  });

  it("uploads a valid image, saves identity through the RPC, and saves the rest via a direct update", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit teams" }));
    const form = screen.getByRole("form", { name: "Edit Team A" });
    const image = new File(["png"], "team.png", { type: "image/png" });

    fireEvent.change(within(form).getByLabelText("Team A name"), { target: { value: "Alpha" } });
    fireEvent.change(within(form).getByLabelText("Team A abbreviation"), { target: { value: "alp" } });
    fireEvent.change(within(form).getByLabelText("Team A captain"), { target: { value: "profile-b" } });
    fireEvent.change(within(form).getByLabelText("Team A banner color"), { target: { value: "#123456" } });
    fireEvent.change(within(form).getByLabelText("Team A division"), { target: { value: "Lunari" } });
    fireEvent.change(within(form).getByLabelText("Team A image"), { target: { files: [image] } });
    fireEvent.click(within(form).getByRole("button", { name: "Save Team A" }));

    await waitFor(() => expect(upload).toHaveBeenCalled());
    const objectPath = upload.mock.calls[0][0] as string;
    expect(objectPath).toMatch(/^draft-1\/team-a\/[^/]+$/);
    expect(upload).toHaveBeenCalledWith(
      objectPath,
      expect.any(File),
      expect.objectContaining({ upsert: false, contentType: "image/png" }),
    );
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("set_team_identity", {
        p_team_id: "team-a",
        p_image_url: publicUrlFor(objectPath),
        p_banner_color: "#123456",
        p_abbreviation: "ALP",
      })
    );
    await waitFor(() =>
      expect(teamQuery.update).toHaveBeenCalledWith({
        name: "Alpha",
        captain_profile_id: "profile-b",
        division: "Lunari",
      })
    );
    expect(publicUrlFor(objectPath)).not.toBe(teams[0].image_url);
    expect(teamQuery.eq).toHaveBeenNthCalledWith(1, "id", "team-a");
    expect(teamQuery.eq).toHaveBeenNthCalledWith(2, "draft_id", "draft-1");
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(teamQuery.update.mock.invocationCallOrder[0]);
    expect(remove).toHaveBeenCalledWith(["draft-1/team-a"]);
    expect(teamQuery.update.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]);
    expect((await within(form).findByRole("status")).textContent).toContain("Team saved.");
    expect(refresh).toHaveBeenCalled();
  });

  it("saves Unassigned as a null division", async () => {
    const teamWithDivision: Team = { ...teams[0], division: "Lunari" };
    renderEditor({ teamRows: [teamWithDivision] });
    fireEvent.click(screen.getByRole("button", { name: "Edit teams" }));
    const form = screen.getByRole("form", { name: "Edit Team A" });

    fireEvent.change(within(form).getByLabelText("Team A division"), { target: { value: "" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save Team A" }));

    await waitFor(() => expect(teamQuery.update).toHaveBeenCalledWith(expect.objectContaining({ division: null })));
  });

  it("keeps the existing image object when its replacement update fails", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Update denied" } });
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit teams" }));
    const form = screen.getByRole("form", { name: "Edit Team A" });

    fireEvent.change(within(form).getByLabelText("Team A name"), { target: { value: "Alpha" } });
    fireEvent.change(within(form).getByLabelText("Team A abbreviation"), { target: { value: "alp" } });
    fireEvent.change(within(form).getByLabelText("Team A image"), {
      target: { files: [new File(["png"], "team.png", { type: "image/png" })] },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Save Team A" }));

    expect((await within(form).findByRole("status")).textContent).toContain("Update denied");
    const replacementPath = upload.mock.calls[0][0] as string;
    expect(replacementPath).toMatch(/^draft-1\/team-a\/[^/]+$/);
    expect(remove).toHaveBeenCalledWith([replacementPath]);
    expect(remove).not.toHaveBeenCalledWith(["draft-1/team-a"]);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(teamQuery.update).not.toHaveBeenCalled();
    expect((within(form).getByLabelText("Team A name") as HTMLInputElement).value).toBe("Alpha");
    expect((within(form).getByLabelText("Team A abbreviation") as HTMLInputElement).value).toBe("ALP");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("clears the saved image URL before removing its object", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit teams" }));
    const form = screen.getByRole("form", { name: "Edit Team A" });

    fireEvent.click(within(form).getByRole("button", { name: "Remove picture" }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("set_team_identity", {
        p_team_id: "team-a",
        p_image_url: null,
        p_banner_color: null,
        p_abbreviation: null,
      })
    );
    await waitFor(() => expect(remove).toHaveBeenCalledWith(["draft-1/team-a"]));
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]);
    expect((await within(form).findByRole("status")).textContent).toContain("Picture removed.");
    expect(refresh).toHaveBeenCalled();
  });

  it("does not remove the existing image object when clearing its URL fails", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Update denied" } });
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit teams" }));
    const form = screen.getByRole("form", { name: "Edit Team A" });

    fireEvent.click(within(form).getByRole("button", { name: "Remove picture" }));

    expect((await within(form).findByRole("status")).textContent).toContain("Update denied");
    expect(remove).not.toHaveBeenCalled();
    expect(within(form).getByRole("button", { name: "Remove picture" })).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("saves cosmetic-only changes without attempting the owner-only write", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit teams" }));
    const form = screen.getByRole("form", { name: "Edit Team A" });

    fireEvent.change(within(form).getByLabelText("Team A abbreviation"), { target: { value: "zzz" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save Team A" }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith(
        "set_team_identity",
        expect.objectContaining({ p_abbreviation: "ZZZ" }),
      )
    );
    expect((await within(form).findByRole("status")).textContent).toContain("Team saved.");
    // name/captain/division are unchanged, so no owner-only write is attempted
    // and a plain admin still gets a normal success for their cosmetic edit.
    expect(teamQuery.update).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it("surfaces an owner-only refusal when a plain admin renames a team, but keeps the already-saved identity change", async () => {
    // RLS lets a plain admin's UPDATE run without raising; it just affects
    // zero rows. `.select("id")` reflects that as an empty array.
    configuredUpdate({ data: [], error: null });
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit teams" }));
    const form = screen.getByRole("form", { name: "Edit Team A" });

    fireEvent.change(within(form).getByLabelText("Team A name"), { target: { value: "Alpha" } });
    fireEvent.change(within(form).getByLabelText("Team A abbreviation"), { target: { value: "zzz" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save Team A" }));

    expect((await within(form).findByRole("status")).textContent).toContain(
      "Renaming a team, reassigning a captain, or changing division is owner-only.",
    );
    // The identity RPC (cosmetic, admin-allowed) already ran and succeeded
    // before the owner-only write was attempted and refused — a plain
    // admin's abbreviation change is saved server-side even though this
    // submit reports an error for the name change.
    expect(rpc).toHaveBeenCalledWith(
      "set_team_identity",
      expect.objectContaining({ p_abbreviation: "ZZZ" }),
    );
    expect(teamQuery.update).toHaveBeenCalledWith(expect.objectContaining({ name: "Alpha" }));
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(teamQuery.update.mock.invocationCallOrder[0]);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("accepts an uppercase alphanumeric abbreviation", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit teams" }));
    const form = screen.getByRole("form", { name: "Edit Team A" });

    fireEvent.change(within(form).getByLabelText("Team A abbreviation"), { target: { value: "t1" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save Team A" }));

    await waitFor(() => expect(rpc).toHaveBeenCalledWith(
      "set_team_identity",
      expect.objectContaining({ p_abbreviation: "T1" }),
    ));
    expect((await within(form).findByRole("status")).textContent).toContain("Team saved.");
  });

  it("accepts a typed hex banner color", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit teams" }));
    const form = screen.getByRole("form", { name: "Edit Team A" });

    fireEvent.change(within(form).getByLabelText("Team A banner hex code"), { target: { value: "#ABCDEF" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save Team A" }));

    await waitFor(() => expect(rpc).toHaveBeenCalledWith(
      "set_team_identity",
      expect.objectContaining({ p_banner_color: "#abcdef" }),
    ));
    expect((await within(form).findByRole("status")).textContent).toContain("Team saved.");
  });

  it("resets form state when rerendered for a different draft", () => {
    const nextTeams: Team[] = [{
      ...teams[0],
      id: "team-b",
      draft_id: "draft-2",
      name: "Team B",
      abbreviation: "TB",
      captain_profile_id: null,
      image_url: null,
      banner_color: "#7c2d12",
    }];
    const view = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit teams" }));
    fireEvent.change(screen.getByLabelText("Team A name"), { target: { value: "Unsaved Alpha" } });

    expect(() => view.rerender(
      <AdminTeamEditor draftId="draft-2" teams={nextTeams} profiles={profiles}>
        <p>Next roster editor content</p>
      </AdminTeamEditor>,
    )).not.toThrow();

    expect(screen.getByText("Next roster editor content")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit teams" }));
    expect((screen.getByLabelText("Team B name") as HTMLInputElement).value).toBe("Team B");
    expect(screen.queryByLabelText("Team A name")).toBeNull();
  });
});

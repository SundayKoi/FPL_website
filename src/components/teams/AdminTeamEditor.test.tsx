import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Profile, Team } from "@/lib/draft/types";
import AdminTeamEditor from "./AdminTeamEditor";

const { from, upload, getPublicUrl, remove, refresh } = vi.hoisted(() => ({
  from: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from,
    storage: { from: () => ({ upload, getPublicUrl, remove }) },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const teamQuery = {
  update: vi.fn(),
  eq: vi.fn(),
};

teamQuery.update.mockReturnValue(teamQuery);
teamQuery.eq.mockReturnValue(teamQuery);
from.mockReturnValue(teamQuery);

const teams: Team[] = [
  {
    id: "team-a",
    draft_id: "draft-1",
    name: "Team A",
    abbreviation: "TA",
    captain_profile_id: "profile-a",
    image_url: "https://img.test/team-a.png",
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

function renderEditor() {
  return render(
    <AdminTeamEditor draftId="draft-1" teams={teams} profiles={profiles}>
      <p>Roster editor content</p>
    </AdminTeamEditor>
  );
}

function configuredUpdate(result: { error: { message: string } | null }) {
  teamQuery.eq.mockImplementation(() => {
    const callCount = teamQuery.eq.mock.calls.length;
    return callCount % 2 === 0 ? Promise.resolve(result) : teamQuery;
  });
}

afterEach(() => {
  cleanup();
  from.mockClear();
  upload.mockReset();
  upload.mockResolvedValue({ error: null });
  getPublicUrl.mockReset();
  getPublicUrl.mockReturnValue({ data: { publicUrl: "https://img.test/updated.png" } });
  remove.mockReset();
  remove.mockResolvedValue({ error: null });
  refresh.mockClear();
  teamQuery.update.mockClear();
  teamQuery.eq.mockReset();
  teamQuery.eq.mockReturnValue(teamQuery);
  from.mockReturnValue(teamQuery);
  configuredUpdate({ error: null });
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
    expect(screen.getByRole("button", { name: "Done editing teams" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Done editing teams" }));

    expect(screen.getByText("Roster editor content")).toBeTruthy();
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
      "Enter a team name, an abbreviation of 1–5 characters, and an allowed image file."
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

  it("uploads a valid image and updates only the team identity fields", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit teams" }));
    const form = screen.getByRole("form", { name: "Edit Team A" });
    const image = new File(["png"], "team.png", { type: "image/png" });

    fireEvent.change(within(form).getByLabelText("Team A name"), { target: { value: "Alpha" } });
    fireEvent.change(within(form).getByLabelText("Team A abbreviation"), { target: { value: "alp" } });
    fireEvent.change(within(form).getByLabelText("Team A captain"), { target: { value: "profile-b" } });
    fireEvent.change(within(form).getByLabelText("Team A image"), { target: { files: [image] } });
    fireEvent.click(within(form).getByRole("button", { name: "Save Team A" }));

    await waitFor(() => expect(upload).toHaveBeenCalledWith(
      "draft-1/team-a",
      expect.any(File),
      expect.objectContaining({ upsert: true, contentType: "image/png" }),
    ));
    await waitFor(() =>
      expect(teamQuery.update).toHaveBeenCalledWith({
        name: "Alpha",
        abbreviation: "ALP",
        captain_profile_id: "profile-b",
        image_url: "https://img.test/updated.png",
      })
    );
    expect(teamQuery.eq).toHaveBeenNthCalledWith(1, "id", "team-a");
    expect(teamQuery.eq).toHaveBeenNthCalledWith(2, "draft_id", "draft-1");
    expect((await within(form).findByRole("status")).textContent).toContain("Team saved.");
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps typed input and cleans up a newly uploaded image when the update fails", async () => {
    configuredUpdate({ error: { message: "Update denied" } });
    remove.mockRejectedValue(new Error("Cleanup failed"));
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
    expect(remove).toHaveBeenCalledWith(["draft-1/team-a"]);
    expect(remove).toHaveBeenCalledTimes(1);
    expect((within(form).getByLabelText("Team A name") as HTMLInputElement).value).toBe("Alpha");
    expect((within(form).getByLabelText("Team A abbreviation") as HTMLInputElement).value).toBe("ALP");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("removes the deterministic image object before clearing the saved image URL", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit teams" }));
    const form = screen.getByRole("form", { name: "Edit Team A" });

    fireEvent.click(within(form).getByRole("button", { name: "Remove picture" }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith(["draft-1/team-a"]));
    await waitFor(() => expect(teamQuery.update).toHaveBeenCalledWith({ image_url: null }));
    expect(teamQuery.eq).toHaveBeenNthCalledWith(1, "id", "team-a");
    expect(teamQuery.eq).toHaveBeenNthCalledWith(2, "draft_id", "draft-1");
    expect((await within(form).findByRole("status")).textContent).toContain("Picture removed.");
    expect(refresh).toHaveBeenCalled();
  });
});

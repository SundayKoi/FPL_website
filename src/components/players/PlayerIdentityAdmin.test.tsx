import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlayerIdentityAdmin, {
  type PlayerIdentityLink,
  type VerifiedProfileOption,
} from "./PlayerIdentityAdmin";
import { assignPlayerIdentity, revokePlayerIdentity } from "@/lib/players/identityActions";

vi.mock("@/lib/players/identityActions", () => ({
  assignPlayerIdentity: vi.fn(),
  revokePlayerIdentity: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const profiles: VerifiedProfileOption[] = [
  { id: "profile-1", displayName: "Alpha Player", discordId: "111111" },
  { id: "profile-2", displayName: "Bravo Player", discordId: "222222" },
  { id: "profile-3", displayName: "Charlie Player", discordId: null },
];

const approvedLink: PlayerIdentityLink = {
  id: "link-1",
  profileId: "profile-1",
  status: "approved",
};

function renderEditor(currentLink: PlayerIdentityLink = null) {
  return render(
    <PlayerIdentityAdmin
      playerPoolId="player-1"
      league="premier"
      season="S5"
      currentLink={currentLink}
      profiles={profiles}
    />,
  );
}

describe("PlayerIdentityAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assignPlayerIdentity).mockResolvedValue({ ok: true });
    vi.mocked(revokePlayerIdentity).mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows unlinked, pending, and linked states with the verified profile name", () => {
    const { rerender } = renderEditor();
    expect(screen.getByText("Unlinked")).toBeTruthy();

    rerender(
      <PlayerIdentityAdmin
        playerPoolId="player-1"
        league="premier"
        season="S5"
        currentLink={{ ...approvedLink, status: "pending" }}
        profiles={profiles}
      />,
    );
    expect(screen.getByText("Pending — Alpha Player")).toBeTruthy();

    rerender(
      <PlayerIdentityAdmin
        playerPoolId="player-1"
        league="premier"
        season="S5"
        currentLink={approvedLink}
        profiles={profiles}
      />,
    );
    expect(screen.getByText("Linked — Alpha Player")).toBeTruthy();
  });

  it("filters verified profiles by display name or Discord ID", () => {
    renderEditor();
    const picker = screen.getByRole("combobox", { name: /verified discord profile/i });

    fireEvent.change(screen.getByRole("textbox", { name: /search verified profiles/i }), {
      target: { value: "bravo" },
    });
    expect(within(picker).getByRole("option", { name: /Bravo Player/ })).toBeTruthy();
    expect(within(picker).queryByRole("option", { name: /Alpha Player/ })).toBeNull();

    fireEvent.change(screen.getByRole("textbox", { name: /search verified profiles/i }), {
      target: { value: "111111" },
    });
    expect(within(picker).getByRole("option", { name: /Alpha Player/ })).toBeTruthy();
    expect(within(picker).queryByRole("option", { name: /Bravo Player/ })).toBeNull();
  });

  it("assigns only the selected verified profile ID and has no free-form Discord field", async () => {
    renderEditor();

    expect(screen.queryByRole("textbox", { name: /discord name/i })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: /verified discord profile/i }), {
      target: { value: "profile-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /link profile/i }));

    await waitFor(() =>
      expect(assignPlayerIdentity).toHaveBeenCalledWith({
        playerPoolId: "player-1",
        profileId: "profile-2",
        league: "premier",
        season: "S5",
      }),
    );
    expect(assignPlayerIdentity).toHaveBeenCalledTimes(1);
  });

  it("confirms replacement before revoking the old link and assigning the selected profile", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderEditor(approvedLink);
    fireEvent.change(screen.getByRole("combobox", { name: /verified discord profile/i }), {
      target: { value: "profile-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /replace profile/i }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Replace Alpha Player"));
    await waitFor(() => expect(revokePlayerIdentity).toHaveBeenCalledWith("link-1"));
    expect(assignPlayerIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: "profile-2" }),
    );
  });

  it("confirms revocation and leaves the link untouched when confirmation is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderEditor(approvedLink);
    fireEvent.click(screen.getByRole("button", { name: /revoke link/i }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Revoke the link to Alpha Player"));
    expect(revokePlayerIdentity).not.toHaveBeenCalled();
  });
});

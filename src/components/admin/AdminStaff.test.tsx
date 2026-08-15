import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminStaff, { type StaffProfile } from "./AdminStaff";

const { rpc, refresh } = vi.hoisted(() => ({
  rpc: vi.fn().mockResolvedValue({ error: null }),
  refresh: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const profiles: StaffProfile[] = [
  { id: "own-1", display_name: "dribb", is_admin: true, is_owner: true },
  { id: "own-2", display_name: "spiesss", is_admin: true, is_owner: true },
  { id: "adm-1", display_name: "Granted Admin", is_admin: true, is_owner: false },
  { id: "usr-1", display_name: "Winter", is_admin: false, is_owner: false },
];

afterEach(() => {
  cleanup();
  rpc.mockClear();
  rpc.mockResolvedValue({ error: null });
  refresh.mockClear();
  vi.restoreAllMocks();
});

describe("AdminStaff", () => {
  it("lists owners and admins without needing a search", () => {
    render(<AdminStaff profiles={profiles} />);

    expect(screen.getByText("dribb")).toBeTruthy();
    expect(screen.getByText("spiesss")).toBeTruthy();
    expect(screen.getByText("Granted Admin")).toBeTruthy();
    // Ordinary members would swamp the list, so they stay hidden until searched.
    expect(screen.queryByText("Winter")).toBeNull();
  });

  it("offers no toggle for an owner", () => {
    render(<AdminStaff profiles={profiles} />);

    expect(screen.queryByRole("button", { name: /admin.*dribb/i })).toBeNull();
    expect(screen.getAllByText("Managed in the database")).toHaveLength(2);
  });

  it("grants admin to someone found by search", async () => {
    render(<AdminStaff profiles={profiles} />);

    fireEvent.change(screen.getByLabelText("Search people"), { target: { value: "win" } });
    fireEvent.click(screen.getByRole("button", { name: "Make admin Winter" }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("set_profile_admin", {
        p_profile_id: "usr-1",
        p_is_admin: true,
      })
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("revokes admin behind a confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminStaff profiles={profiles} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove admin from Granted Admin" }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("set_profile_admin", {
        p_profile_id: "adm-1",
        p_is_admin: false,
      })
    );
  });

  it("does not revoke when the confirmation is declined", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<AdminStaff profiles={profiles} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove admin from Granted Admin" }));

    expect(rpc).not.toHaveBeenCalled();
  });

  it("surfaces a rejected change with the error code stripped", async () => {
    rpc.mockResolvedValue({
      error: { message: "NOT_OWNER: only a league owner can change admin access" },
    });
    render(<AdminStaff profiles={profiles} />);

    fireEvent.change(screen.getByLabelText("Search people"), { target: { value: "win" } });
    fireEvent.click(screen.getByRole("button", { name: "Make admin Winter" }));

    expect(await screen.findByText("only a league owner can change admin access")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });
});

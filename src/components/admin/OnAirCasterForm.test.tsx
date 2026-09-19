import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OnAirCasterForm from "./OnAirCasterForm";

const { from, upsert, refresh } = vi.hoisted(() => {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  return { from: vi.fn(() => ({ upsert })), upsert, refresh: vi.fn() };
});

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ from }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const props = {
  profileId: "caster-a",
  name: "Static",
  champion: "Bard",
  skin: 3,
  roleLabel: "Play-by-play",
  tagline: "Chimes on the three.",
  active: true,
};

afterEach(() => {
  cleanup();
  from.mockClear();
  from.mockReturnValue({ upsert });
  upsert.mockReset();
  upsert.mockResolvedValue({ error: null });
  refresh.mockReset();
});

describe("OnAirCasterForm", () => {
  it("upserts what was typed and refreshes the desk", async () => {
    render(<OnAirCasterForm {...props} />);

    fireEvent.change(screen.getByLabelText("Champion"), { target: { value: "Ahri" } });
    fireEvent.change(screen.getByLabelText("Skin"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Role word"), { target: { value: "Colour" } });
    fireEvent.change(screen.getByLabelText("Tagline"), { target: { value: "Back after these." } });
    fireEvent.click(screen.getByLabelText("In the pool"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(from).toHaveBeenCalledWith("on_air_casters");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        profile_id: "caster-a",
        champion: "Ahri",
        skin: 7,
        role_label: "Colour",
        tagline: "Back after these.",
        active: false,
      }),
    );
    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("saves a blank champion as no signal rather than as an empty string", async () => {
    render(<OnAirCasterForm {...props} />);

    fireEvent.change(screen.getByLabelText("Champion"), { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText("Tagline"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(upsert).toHaveBeenCalled());
    expect(upsert.mock.calls[0][0]).toMatchObject({ champion: null, tagline: null });
  });

  it("shows the database's own words when the save is refused", async () => {
    upsert.mockResolvedValue({ error: { message: "new row violates row-level security policy" } });
    render(<OnAirCasterForm {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("new row violates row-level security policy"));
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.queryByText("Saved")).toBeNull();
  });
});

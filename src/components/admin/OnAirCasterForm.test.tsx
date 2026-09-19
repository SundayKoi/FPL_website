import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OnAirCasterForm from "./OnAirCasterForm";

const { from, upsert, refresh } = vi.hoisted(() => {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  return { from: vi.fn(() => ({ upsert })), upsert, refresh: vi.fn() };
});
const { fetchOnAirSkinCatalogAction } = vi.hoisted(() => ({ fetchOnAirSkinCatalogAction: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ from }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/cards/onAir-actions", () => ({ fetchOnAirSkinCatalogAction }));

// Riot names the base skin "default", not "Original" — the field is what
// turns num 0 into a word a human reads.
const CATALOGS: Record<string, { num: number; name: string }[]> = {
  Bard: [
    { num: 0, name: "default" },
    { num: 3, name: "Bard Bard" },
  ],
  Ahri: [
    { num: 0, name: "default" },
    { num: 7, name: "Foxfire Ahri" },
  ],
};

const props = {
  profileId: "caster-a",
  name: "Static",
  champion: "Bard",
  skin: 3,
  roleLabel: "Play-by-play",
  tagline: "Chimes on the three.",
  active: true,
};

const skinField = () => screen.getByLabelText("Skin");
const skinSelect = () => screen.getByLabelText("Skin") as HTMLSelectElement;
const skinOptions = () => [...skinSelect().options].map((option) => option.textContent);
const skinArt = () => screen.getByTestId("on-air-caster-a-skin-art") as HTMLImageElement;

beforeEach(() => {
  fetchOnAirSkinCatalogAction.mockReset();
  fetchOnAirSkinCatalogAction.mockImplementation(async (champion: string) => ({
    ok: true,
    champion,
    available: true,
    skins: CATALOGS[champion] ?? [{ num: 0, name: "default" }],
  }));
});

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
    await waitFor(() => expect(skinOptions()).toEqual(["Original", "Foxfire Ahri"]));
    fireEvent.change(skinField(), { target: { value: "7" } });
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

  it("names the champion's skins in the field, and asks Riot once per champion", async () => {
    render(<OnAirCasterForm {...props} />);

    // While the catalog is being read the field is already the picker, so it
    // never flips from number to select under the cursor.
    expect(skinOptions()).toEqual(["Loading skins…"]);
    expect(skinSelect().disabled).toBe(true);

    await waitFor(() => expect(skinOptions()).toEqual(["Original", "Bard Bard"]));
    expect(skinSelect().disabled).toBe(false);
    expect(skinSelect().value).toBe("3");
    expect(fetchOnAirSkinCatalogAction).toHaveBeenCalledWith("Bard");

    // Back to a champion already in the map: no second read.
    fireEvent.change(screen.getByLabelText("Champion"), { target: { value: "Ahri" } });
    await waitFor(() => expect(skinOptions()).toEqual(["Original", "Foxfire Ahri"]));
    fireEvent.change(screen.getByLabelText("Champion"), { target: { value: "bard" } });
    await waitFor(() => expect(skinOptions()).toEqual(["Original", "Bard Bard"]));
    expect(fetchOnAirSkinCatalogAction.mock.calls.map((call) => call[0])).toEqual(["Bard", "Ahri"]);
  });

  it("shows the art of the skin chosen, and changes it with the choice", async () => {
    render(<OnAirCasterForm {...props} />);

    fireEvent.change(screen.getByLabelText("Champion"), { target: { value: "Ahri" } });
    await waitFor(() => expect(skinOptions()).toEqual(["Original", "Foxfire Ahri"]));
    expect(skinArt().getAttribute("src")).toContain("Ahri_0");

    fireEvent.change(skinField(), { target: { value: "7" } });
    expect(skinArt().getAttribute("src")).toContain("Ahri_7");
  });

  it("changing the champion resets the skin to base and loads the new list", async () => {
    render(<OnAirCasterForm {...props} />);

    await waitFor(() => expect(skinSelect().value).toBe("3"));
    fireEvent.change(screen.getByLabelText("Champion"), { target: { value: "Ahri" } });

    await waitFor(() => expect(skinOptions()).toEqual(["Original", "Foxfire Ahri"]));
    expect(skinSelect().value).toBe("0");
    // The same champion spelled differently keeps the choice.
    fireEvent.change(skinField(), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Champion"), { target: { value: "  ahri" } });
    await waitFor(() => expect(skinSelect().value).toBe("7"));
  });

  it("falls back to the number input when the action cannot name the champion", async () => {
    fetchOnAirSkinCatalogAction.mockResolvedValue({ ok: false, error: "Unknown champion." });
    render(<OnAirCasterForm {...props} />);

    await waitFor(() => expect(skinField().getAttribute("type")).toBe("number"));
    expect(screen.getByRole("alert").textContent).toBe("Unknown champion.");
    expect(screen.getByText("Riot's skin number; the list could not be loaded")).toBeTruthy();

    fireEvent.change(skinField(), { target: { value: "42" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(upsert).toHaveBeenCalled());
    expect(upsert.mock.calls[0][0]).toMatchObject({ champion: "Bard", skin: 42 });
  });

  it("reads Riot again when the champion field is blurred after a failed read", async () => {
    fetchOnAirSkinCatalogAction.mockResolvedValueOnce({ ok: false, error: "Unknown champion." });
    render(<OnAirCasterForm {...props} />);

    await waitFor(() => expect(skinField().getAttribute("type")).toBe("number"));

    fireEvent.blur(screen.getByLabelText("Champion"));

    await waitFor(() => expect(skinOptions()).toEqual(["Original", "Bard Bard"]));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(fetchOnAirSkinCatalogAction.mock.calls.map((call) => call[0])).toEqual(["Bard", "Bard"]);
  });

  it("falls back to the number input when Riot's list is unavailable, up to 200", async () => {
    fetchOnAirSkinCatalogAction.mockResolvedValue({
      ok: true,
      champion: "Bard",
      available: false,
      skins: [{ num: 0, name: "default" }],
    });
    render(<OnAirCasterForm {...props} />);

    await waitFor(() => expect(skinField().getAttribute("type")).toBe("number"));
    expect(skinField().getAttribute("max")).toBe("200");

    fireEvent.change(skinField(), { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(upsert).toHaveBeenCalled());
    expect(upsert.mock.calls[0][0]).toMatchObject({ skin: 150 });
  });

  it("says so when there is no champion at all, and clamps the number to 0–200", async () => {
    render(<OnAirCasterForm {...props} champion={null} />);

    expect(skinField().getAttribute("type")).toBe("number");
    expect(screen.getByText("Set a champion to pick a skin by name")).toBeTruthy();
    expect(screen.queryByTestId("on-air-caster-a-skin-art")).toBeNull();
    expect(fetchOnAirSkinCatalogAction).not.toHaveBeenCalled();

    fireEvent.change(skinField(), { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(upsert).toHaveBeenCalled());
    expect(upsert.mock.calls[0][0]).toMatchObject({ champion: null, skin: 200 });
  });

  it("keeps a stale num on the list and refuses it on save", async () => {
    render(<OnAirCasterForm {...props} skin={14} />);

    await waitFor(() => expect(skinOptions()).toEqual(["Original", "Bard Bard", "Skin 14 (not in Riot's list)"]));
    expect(skinSelect().value).toBe("14");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("That skin is not one of Bard's."));
    expect(upsert).not.toHaveBeenCalled();
    // Nothing was silently changed: the stale num is still what the field shows.
    expect(skinSelect().value).toBe("14");
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Motto saves still use the table directly; artwork pairs use the server action. */
const { from, refresh } = vi.hoisted(() => {
  const upsert = vi.fn(async (...args: unknown[]) => {
    void args;
    return { error: null };
  });
  return { upsert, from: vi.fn(() => ({ upsert })), refresh: vi.fn() };
});

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ from }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const { saveCardArtworkAction } = vi.hoisted(() => ({
  saveCardArtworkAction: vi.fn(async (...args: unknown[]) => {
    void args;
    return { ok: true as const };
  }),
}));
vi.mock("@/lib/cards/artwork-actions", () => ({ saveCardArtworkAction }));

import SkinPicker from "./SkinPicker";

const card = { season: "S5", summonerName: "7gen", tag: "NA1", champion: "Jhin" };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** The picker is closed until asked for. */
function open() {
  fireEvent.click(screen.getByRole("button", { name: "Customize Season Card" }));
}

function thumbs(container: HTMLElement) {
  return [...container.querySelectorAll('img[src*="/champion/"]')] as HTMLImageElement[];
}

describe("SkinPicker", () => {
  it("renders one thumbnail per catalog entry, high nums included", () => {
    // Riot's skin nums are sparse ids — 64 is a real Jhin skin and the old
    // blind 0..20 probe could never reach it.
    const { container } = render(<SkinPicker {...card} currentSkin={0} skinNums={[0, 1, 23, 64]} />);
    open();

    const srcs = thumbs(container).map((img) => img.getAttribute("src"));
    expect(srcs).toHaveLength(4);
    expect(srcs[0]).toContain("/centered/Jhin_0.jpg");
    expect(srcs[3]).toContain("/centered/Jhin_64.jpg");
  });

  it("shows base art alone when no catalog was passed", () => {
    const { container } = render(<SkinPicker {...card} currentSkin={0} />);
    open();

    expect(thumbs(container)).toHaveLength(1);
  });

  it("keeps the worn skin in the grid even if the catalog missed it", () => {
    const { container } = render(<SkinPicker {...card} currentSkin={37} skinNums={[0]} />);
    open();

    const srcs = thumbs(container).map((img) => img.getAttribute("src"));
    expect(srcs.some((src) => src?.includes("Jhin_37.jpg"))).toBe(true);
    expect(screen.getByText("Skin 37")).toBeTruthy();
  });

  it("falls a thumbnail back to the regular splash before dropping it", () => {
    const { container } = render(<SkinPicker {...card} currentSkin={0} skinNums={[0, 64]} />);
    open();

    const thumb = thumbs(container).find((img) => img.getAttribute("src")?.includes("_64")) as HTMLImageElement;
    fireEvent.error(thumb);
    expect(thumb.getAttribute("src")).toContain("/splash/Jhin_64.jpg");

    // Neither directory has it: only now does the thumbnail leave the grid.
    fireEvent.error(thumb);
    expect(thumbs(container).some((img) => img.getAttribute("src")?.includes("_64"))).toBe(false);
  });

  it("starts expanded when the visitor came here to customize", () => {
    // /card/[slug]?customize=1 — the hub's "Customize your card →" already
    // said what this visit is for; a second toggle is a dead end.
    const { container } = render(<SkinPicker {...card} currentSkin={0} skinNums={[0, 64]} initialOpen />);

    expect(thumbs(container)).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Close customizer" })).toBeTruthy();
  });

  it("saves the picked skin against the card's Riot identity only after Save", async () => {
    const { container } = render(<SkinPicker {...card} currentSkin={0} skinNums={[0, 64]} eligibleChampions={[{ champion: "Jhin", games: 4 }]} />);
    open();

    const thumb = thumbs(container).find((img) => img.getAttribute("src")?.includes("_64")) as HTMLImageElement;
    fireEvent.click(thumb.closest("button")!);

    expect(saveCardArtworkAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save artwork" }));
    await waitFor(() => expect(saveCardArtworkAction).toHaveBeenCalledTimes(1));
    expect(saveCardArtworkAction.mock.calls[0][0]).toMatchObject({ season: "S5", summonerName: "7gen", tag: "NA1", artChampion: "Jhin", skin: 64 });
  });

  it("loads the new champion's catalog without carrying the old skin, then clears the override", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      available: true,
      skins: [{ num: 0, name: "Original" }, { num: 12, name: "Arcane" }],
    }), { status: 200 })));
    const { container } = render(
      <SkinPicker
        {...card}
        currentSkin={64}
        currentArtChampion="Jhin"
        hasArtOverride
        skinCatalog={[{ num: 0, name: "Original" }, { num: 64, name: "Jhin Skin" }]}
        skinCatalogAvailable
        eligibleChampions={[{ champion: "Jhin", games: 4 }, { champion: "Lux", games: 1 }]}
      />,
    );
    open();
    fireEvent.change(screen.getByRole("combobox", { name: "Champion played this split" }), { target: { value: "Lux" } });
    const luxSkin = await screen.findByAltText("Lux — Arcane");
    expect(luxSkin.getAttribute("src")).toContain("Lux_12.jpg");
    fireEvent.click(luxSkin.closest("button")!);
    fireEvent.click(screen.getByRole("button", { name: "Save artwork" }));
    await waitFor(() => expect(saveCardArtworkAction).toHaveBeenCalledTimes(1));
    expect(saveCardArtworkAction.mock.calls[0][0]).toMatchObject({ artChampion: "Lux", skin: 12 });

    fireEvent.click(screen.getByRole("button", { name: "Use most-played champion" }));
    expect((screen.getByRole("combobox", { name: "Champion played this split" }) as HTMLSelectElement).value).toBe("Jhin");
    fireEvent.click(screen.getByRole("button", { name: "Save artwork" }));
    await waitFor(() => expect(saveCardArtworkAction).toHaveBeenCalledTimes(2));
    expect(saveCardArtworkAction.mock.calls[1][0]).toMatchObject({ artChampion: null, skin: 0 });
    expect(container.querySelector('img[src*="Lux_64.jpg"]')).toBeNull();
  });
});

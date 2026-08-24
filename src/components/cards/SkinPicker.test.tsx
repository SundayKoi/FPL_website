import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/** The one call the picker makes: from("card_art_prefs").upsert(row, opts). */
const { upsert, from, refresh } = vi.hoisted(() => {
  const upsert = vi.fn(async (row: Record<string, unknown>, options?: unknown) => {
    void row;
    void options;
    return { error: null };
  });
  return { upsert, from: vi.fn(() => ({ upsert })), refresh: vi.fn() };
});

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ from }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import SkinPicker from "./SkinPicker";

const card = { season: "S5", summonerName: "7gen", tag: "NA1", champion: "Jhin" };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** The picker is closed until asked for. */
function open() {
  fireEvent.click(screen.getByRole("button", { name: "Customize card" }));
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
    expect(screen.getByText("In use")).toBeTruthy();
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

  it("saves the picked skin against the card's Riot identity", async () => {
    const { container } = render(<SkinPicker {...card} currentSkin={0} skinNums={[0, 64]} />);
    open();

    const thumb = thumbs(container).find((img) => img.getAttribute("src")?.includes("_64")) as HTMLImageElement;
    fireEvent.click(thumb.closest("button")!);

    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(upsert.mock.calls[0][0]).toMatchObject({ season: "S5", summoner_name: "7gen", tag: "NA1", skin: 64 });
  });
});

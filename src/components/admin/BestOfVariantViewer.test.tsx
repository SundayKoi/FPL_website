import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import type { SeasonAward } from "@/lib/season-end/derive";
import BestOfVariantViewer from "./BestOfVariantViewer";

const award: SeasonAward = {
  id: "best-of-champion",
  title: "Best of Champion",
  description: "One unique played champion per player.",
  group: "Best of Champions",
  scope: "player",
  partition: "league",
  status: "ready",
  winners: [],
};

const winner = {
  name: "Alice#NA1",
  team: "Wolves",
  value: 5,
  games: 7,
  champion: "Azir",
  championGames: 7,
  title: "Best of Azir",
  evidence: { bestOf: { wins: 5, losses: 2, winRate: 71.4, meanPerformance: 88.4, seasonGames: 8, championGames: 7 } },
};

const playerCard = {
  name: "Alice",
  tag: "NA1",
  teamName: "Wolves",
  signature: { champion: "Ahri", games: 6 },
} as PlayerCardData;

const response = (overrides: Record<string, unknown> = {}) => ({
  key: "premier|S5|alice|na1|azir",
  champion: "Azir",
  skins: [{ num: 0, name: "Original" }, { num: 64, name: "Star Guardian" }],
  catalogAvailable: true,
  autograph: "data:image/png;base64,ink",
  autographStatus: "available",
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderViewer() {
  return render(
    <BestOfVariantViewer
      award={award}
      winner={winner}
      playerCard={playerCard}
      season="S5"
      league="premier"
      headingId="best-of-variant"
      division="Solari"
    >
      <div>Existing card</div>
    </BestOfVariantViewer>,
  );
}

describe("BestOfVariantViewer", () => {
  it("browses an alternate skin with the real season autograph and resets both choices", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(response()), { status: 200 })));
    renderViewer();

    const opener = screen.getByRole("button", { name: "View variants" });
    fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog");
    const skin = within(dialog).getByRole("button", { name: "Star Guardian skin" });
    fireEvent.click(skin);
    fireEvent.click(within(dialog).getByRole("button", { name: "Signed" }));

    expect(within(dialog).getByTestId("best-of-card-art").getAttribute("data-art-skin")).toBe("64");
    expect(within(dialog).getByTestId("best-of-autograph")).toBeTruthy();
    expect(within(dialog).getByText(/Star Guardian · Signed/)).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Reset to base" }));
    expect(within(dialog).getByTestId("best-of-card-art").getAttribute("data-art-skin")).toBe("0");
    expect(within(dialog).queryByTestId("best-of-autograph")).toBeNull();
    expect(within(dialog).getByText(/Original · Unsigned/)).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  it("keeps unsigned browsing available when the season has no autograph", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(response({ autograph: null, autographStatus: "missing" })), { status: 200 })));
    renderViewer();
    fireEvent.click(screen.getByRole("button", { name: "View variants" }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText("No signature on file for this season.")).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: "Signed" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(dialog).getByRole("button", { name: "Unsigned" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("offers retry after a failed variant read", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("temporary outage"))
      .mockResolvedValueOnce(new Response(JSON.stringify(response()), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    renderViewer();
    fireEvent.click(screen.getByRole("button", { name: "View variants" }));

    expect((await screen.findByRole("alert")).textContent).toContain("temporary outage");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: "Star Guardian skin" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls a broken thumbnail back to the same skin's splash and then removes it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(response()), { status: 200 })));
    renderViewer();
    fireEvent.click(screen.getByRole("button", { name: "View variants" }));
    const dialog = await screen.findByRole("dialog");
    const skinButton = within(dialog).getByRole("button", { name: "Star Guardian skin" });
    fireEvent.click(skinButton);
    const image = skinButton.querySelector("img")!;
    fireEvent.error(image);
    expect(image.getAttribute("src")).toContain("/splash/Azir_64.jpg");
    fireEvent.error(image);
    expect(within(dialog).queryByRole("button", { name: "Star Guardian skin" })).toBeNull();
    expect(within(dialog).getByText(/This skin's artwork is unavailable/)).toBeTruthy();
  });
});

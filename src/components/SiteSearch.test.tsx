import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SiteSearch from "./SiteSearch";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const logSearch = vi.fn<(query: string, results: number, league: string) => Promise<void>>(async () => {});
vi.mock("@/lib/site/search-actions", () => ({
  logSiteSearchAction: (query: string, results: number, league: string) => logSearch(query, results, league),
}));

beforeEach(() => {
  push.mockReset();
  logSearch.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        players: [{ kind: "player", label: "Doug", href: "/players/Doug%23NA1", hint: "Player" }],
        teams: [{ kind: "team", label: "Neon Dynasty", href: "/teams/neon-dynasty", hint: "Team" }],
      }),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SiteSearch", () => {
  it("opens from the button with places to jump to, and closes on Escape", async () => {
    render(<SiteSearch league="premier" />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /search the site/i }));
    expect(screen.getByRole("dialog", { name: /search the site/i })).toBeTruthy();
    // Players and teams are fetched once, the first time the palette opens.
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/search/index"));
    expect(screen.getByRole("option", { name: /Players/ })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens on ⌘K and finds pages, players and teams", async () => {
    render(<SiteSearch league="premier" />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "vault" } });
    expect(screen.getByRole("option", { name: /Rarest cards/ }).querySelector("a")?.getAttribute("href")).toBe("/cards/vault");

    fireEvent.change(input, { target: { value: "doug" } });
    await waitFor(() => expect(screen.getByRole("option", { name: /Doug/ })).toBeTruthy());

    fireEvent.change(input, { target: { value: "neon" } });
    await waitFor(() => expect(screen.getByRole("option", { name: /Neon Dynasty/ })).toBeTruthy());
  });

  it("walks the list with the arrows and opens the pick on Enter", () => {
    render(<SiteSearch league="academy" />);
    fireEvent.click(screen.getByRole("button", { name: /search the site/i }));
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "cards" } });
    // "Cards" outranks its longer cousins for the bare word.
    const options = screen.getAllByRole("option");
    expect(options[0].textContent).toContain("Cards");
    expect(options[0].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const second = screen.getAllByRole("option")[1];
    expect(second.getAttribute("aria-selected")).toBe("true");
    const href = second.querySelector("a")?.getAttribute("href");
    act(() => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(push).toHaveBeenCalledWith(href);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("badges the pages that need the role so a wall is never a surprise", async () => {
    render(<SiteSearch league="premier" />);
    fireEvent.click(screen.getByRole("button", { name: /search the site/i }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "packs" } });
    const packs = screen.getByRole("option", { name: /^Packs/ });
    expect(within(packs).getByText("Premium")).toBeTruthy();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "vault" } });
    const vault = screen.getByRole("option", { name: /Rarest cards/ });
    expect(within(vault).queryByText("Premium")).toBeNull();
  });

  it("says so when nothing matches", async () => {
    render(<SiteSearch league="premier" />);
    fireEvent.click(screen.getByRole("button", { name: /search the site/i }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zzzzzz" } });
    await waitFor(() => expect(screen.getByText(/Nothing matches/)).toBeTruthy());
  });

  describe("logging what people look for", () => {
    afterEach(() => vi.useRealTimers());

    async function openAndLoad(league: "premier" | "academy" = "premier") {
      render(<SiteSearch league={league} />);
      fireEvent.click(screen.getByRole("button", { name: /search the site/i }));
      await waitFor(() => expect(screen.queryByText("Loading players and teams…")).toBeNull());
      vi.useFakeTimers();
      return screen.getByRole("combobox");
    }

    it("logs a search once typing settles, with its result count and league", async () => {
      const input = await openAndLoad("academy");
      fireEvent.change(input, { target: { value: "Where  is the VAULT" } });
      act(() => vi.advanceTimersByTime(1000));
      expect(logSearch).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(600));
      expect(logSearch).toHaveBeenCalledTimes(1);
      expect(logSearch.mock.calls[0]).toEqual(["where is the vault", expect.any(Number), "academy"]);
    });

    it("logs a miss as zero results", async () => {
      const input = await openAndLoad();
      fireEvent.change(input, { target: { value: "qqqqzzzz" } });
      act(() => vi.advanceTimersByTime(1600));
      expect(logSearch.mock.calls[0]).toEqual(["qqqqzzzz", 0, "premier"]);
    });

    it("skips words on their way to being typed, one-letter searches, and repeats", async () => {
      const input = await openAndLoad();
      fireEvent.change(input, { target: { value: "s" } });
      act(() => vi.advanceTimersByTime(1600));
      fireEvent.change(input, { target: { value: "sta" } });
      act(() => vi.advanceTimersByTime(500));
      fireEvent.change(input, { target: { value: "standings" } });
      act(() => vi.advanceTimersByTime(1600));
      fireEvent.change(input, { target: { value: "stand" } });
      act(() => vi.advanceTimersByTime(1600));
      fireEvent.change(input, { target: { value: "standings" } });
      act(() => vi.advanceTimersByTime(1600));
      expect(logSearch.mock.calls.map((call) => call[0])).toEqual(["standings", "stand"]);
    });
  });
});

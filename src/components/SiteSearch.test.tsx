import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SiteSearch from "./SiteSearch";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  push.mockReset();
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
    expect(screen.getByRole("option", { name: /The Vault/ }).querySelector("a")?.getAttribute("href")).toBe("/cards/vault");

    fireEvent.change(input, { target: { value: "doug" } });
    await waitFor(() => expect(screen.getByRole("option", { name: /Doug/ })).toBeTruthy());

    fireEvent.change(input, { target: { value: "neon" } });
    await waitFor(() => expect(screen.getByRole("option", { name: /Neon Dynasty/ })).toBeTruthy());
  });

  it("walks the list with the arrows and opens the pick on Enter", () => {
    render(<SiteSearch league="academy" />);
    fireEvent.click(screen.getByRole("button", { name: /search the site/i }));
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "stats" } });
    // "Stats" outranks "Pack stats" for the bare word.
    const options = screen.getAllByRole("option");
    expect(options[0].textContent).toContain("Stats");
    expect(options[0].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1].getAttribute("aria-selected")).toBe("true");
    act(() => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(push).toHaveBeenCalledWith("/academy/cards/stats");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says so when nothing matches", async () => {
    render(<SiteSearch league="premier" />);
    fireEvent.click(screen.getByRole("button", { name: /search the site/i }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zzzzzz" } });
    await waitFor(() => expect(screen.getByText(/Nothing matches/)).toBeTruthy());
  });
});

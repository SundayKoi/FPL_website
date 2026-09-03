import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUrlState } from "./useUrlState";

const { search } = vi.hoisted(() => ({ search: { value: "" } }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search.value) }));

function Shelf() {
  const [view, setView] = useUrlState({ sort: "best", q: "" });
  return (
    <div>
      <output data-testid="sort">{view.sort}</output>
      <output data-testid="q">{view.q}</output>
      <button type="button" onClick={() => setView({ sort: "name" })}>
        by name
      </button>
      <button type="button" onClick={() => setView({ q: "doug" })}>
        search
      </button>
      <button type="button" onClick={() => setView({ sort: "best", q: "" })}>
        reset
      </button>
    </div>
  );
}

beforeEach(() => {
  search.value = "";
  window.history.replaceState(null, "", "/cards/collection?week=2026-08-24");
});
afterEach(cleanup);

describe("useUrlState", () => {
  it("starts from the URL when it has something to say", () => {
    search.value = "sort=name&q=doug";
    render(<Shelf />);
    expect(screen.getByTestId("sort").textContent).toBe("name");
    expect(screen.getByTestId("q").textContent).toBe("doug");
  });

  it("writes changes into the URL, leaves defaults out, and keeps other params", () => {
    render(<Shelf />);
    expect(window.location.search).toBe("?week=2026-08-24");
    act(() => {
      screen.getByRole("button", { name: "by name" }).click();
    });
    expect(window.location.search).toBe("?week=2026-08-24&sort=name");
    act(() => {
      screen.getByRole("button", { name: "search" }).click();
    });
    expect(window.location.search).toBe("?week=2026-08-24&sort=name&q=doug");
    act(() => {
      screen.getByRole("button", { name: "reset" }).click();
    });
    expect(window.location.search).toBe("?week=2026-08-24");
  });
});

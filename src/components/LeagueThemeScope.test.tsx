import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LeagueThemeScope from "./LeagueThemeScope";

const route = vi.hoisted(() => ({ pathname: "/", search: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
}));

afterEach(() => {
  cleanup();
  route.pathname = "/";
  route.search = "";
});

describe("LeagueThemeScope", () => {
  it("emits the resolved league as one DOM attribute", () => {
    const { container, rerender } = render(
      <LeagueThemeScope>
        <main>content</main>
      </LeagueThemeScope>,
    );

    const scope = container.firstElementChild;
    expect(scope?.getAttribute("data-league")).toBe("premier");
    expect(scope?.querySelector("main")?.textContent).toBe("content");

    route.pathname = "/academy/stats";
    rerender(
      <LeagueThemeScope>
        <main>content</main>
      </LeagueThemeScope>,
    );
    expect(container.firstElementChild?.getAttribute("data-league")).toBe("academy");
  });

  it("updates for Premium HQ query changes without replacing page children", () => {
    const child = <main>premium</main>;
    const { container, rerender } = render(<LeagueThemeScope>{child}</LeagueThemeScope>);
    const main = container.querySelector("main");

    route.pathname = "/premium";
    route.search = "league=academy";
    rerender(<LeagueThemeScope>{child}</LeagueThemeScope>);

    expect(container.firstElementChild?.getAttribute("data-league")).toBe("academy");
    expect(container.querySelector("main")).toBe(main);
  });
});

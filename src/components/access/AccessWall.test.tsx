import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AccessWall from "./AccessWall";

afterEach(cleanup);

describe("AccessWall", () => {
  it("sends a signed-out visitor to sign in, back to where they were going", () => {
    render(<AccessWall section="Packs" reason="signed-out" redirect="/cards/packs" />);
    const link = screen.getByRole("link", { name: /sign in with discord/i });
    expect(link.getAttribute("href")).toBe("/login?redirect=/cards/packs");
    expect(screen.queryByRole("link", { name: /discord ↗|find the discord/i })).toBeNull();
  });

  it("always gives a non-member a next step: the Discord, the premium page, and the open door", () => {
    render(<AccessWall section="Packs" reason="no-role" redirect="/cards/packs" browse="/cards/browse" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("FPL Premium members only");
    expect(screen.getByRole("link", { name: /discord/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /what fpl premium is/i }).getAttribute("href")).toBe("/premium");
    expect(screen.getByRole("link", { name: /just browse the cards/i }).getAttribute("href")).toBe("/cards/browse");
  });

  it("tells a lapsed member their things are safe and how to come back", () => {
    render(<AccessWall section="My collection" reason="lapsed" redirect="/cards/collection" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("lapsed");
    expect(screen.getByText(/everything you own is still here/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /get fpl premium back/i }).getAttribute("href")).toBe("/premium");
  });

  it("prints a note under the buttons when given one", () => {
    render(<AccessWall section="Match Drafter" reason="no-role" redirect="/drafter" note="Draft links you've been sent still work." />);
    expect(screen.getByText(/draft links you've been sent still work/i)).toBeTruthy();
  });
});

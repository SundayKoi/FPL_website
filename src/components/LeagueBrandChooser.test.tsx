import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LeagueBrandChooser from "./LeagueBrandChooser";

describe("LeagueBrandChooser", () => {
  afterEach(cleanup);
  it("shows the FPL brand and sends the active Premier league home", () => {
    render(<LeagueBrandChooser pathname="/stats" search="tab=Players" onNavigate={vi.fn()} />);

    expect(screen.getByRole("button", { name: /fpl, premier division, choose league/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /choose league/i }));

    expect(screen.getByRole("menuitem", { name: /^FPL, Premier division$/ }).getAttribute("href")).toBe("/");
  });

  it("shows the distinct Academy mark and preserves the paired page", () => {
    render(<LeagueBrandChooser pathname="/academy/stats" search="tab=Players" onNavigate={vi.fn()} />);

    expect(screen.getByRole("button", { name: /fpl academy, academy division, choose league/i })).toBeTruthy();
    expect(screen.getByTestId("academy-mark")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /choose league/i }));

    expect(screen.getByRole("menuitem", { name: /^FPL, Premier division$/ }).getAttribute("href")).toBe(
      "/stats?tab=Players",
    );
    expect(screen.getByRole("menuitem", { name: /^FPL Academy, Academy division$/ }).getAttribute("href")).toBe(
      "/academy",
    );
  });

  it("closes on Escape and outside click", () => {
    render(<LeagueBrandChooser pathname="/academy/stats" search="" onNavigate={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: /choose league/i });

    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("calls onNavigate after selecting a league", () => {
    const onNavigate = vi.fn();
    render(<LeagueBrandChooser pathname="/stats" search="" onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole("button", { name: /choose league/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^FPL Academy, Academy division$/ }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("closes after selecting the current league home", () => {
    const onNavigate = vi.fn();
    render(<LeagueBrandChooser pathname="/stats" search="" onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole("button", { name: /choose league/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^FPL, Premier division$/ }));

    expect(screen.queryByRole("menu")).toBeNull();
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});

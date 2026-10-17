import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { HomeOffseasonEvent } from "@/lib/offseason/home";
import OffseasonHomeBanner from "./HomeBanner";

afterEach(cleanup);

const event = (overrides: Partial<HomeOffseasonEvent>): HomeOffseasonEvent => ({
  name: "FPL Offseason Tournament",
  status: "signups",
  signups_open: true,
  next: null,
  ...overrides,
});

const href = (name: string | RegExp) => screen.getByRole("link", { name }).getAttribute("href");

describe("OffseasonHomeBanner", () => {
  it("renders nothing without a running event", () => {
    const { container } = render(<OffseasonHomeBanner event={null} layout="band" />);
    expect(container.innerHTML).toBe("");
  });

  it("sends visitors to sign up while sign-ups are open", () => {
    render(<OffseasonHomeBanner event={event({})} layout="panel" />);
    expect(screen.getByRole("region", { name: "FPL Offseason Tournament" })).toBeTruthy();
    expect(href(/go to the offseason/i)).toBe("/offseason");
    expect(href("Sign up")).toBe("/offseason/signup");
  });

  it("asks the pool to lock in once sign-ups close", () => {
    render(<OffseasonHomeBanner event={event({ signups_open: false })} layout="band" />);
    expect(screen.getByText(/lock in your role/i)).toBeTruthy();
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/offseason"]);
  });

  it("says when the week drafts next", () => {
    render(<OffseasonHomeBanner event={event({ signups_open: false, next: { kind: "draft", weekNumber: 1, at: "2026-10-19T00:00:00Z" } })} layout="panel" />);
    expect(screen.getByText(/Week 1 draft/).textContent).toBe("Week 1 draft · Sun, Oct 18, 8:00 PM EDT");
  });

  it("links the schedule once the weeks are being played", () => {
    render(<OffseasonHomeBanner event={event({ status: "finals", signups_open: false })} layout="band" />);
    expect(href(/go to the offseason/i)).toBe("/offseason");
    expect(href("Schedule")).toBe("/offseason/schedule");
  });
});

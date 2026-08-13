import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StatusPill } from "./StatusPill";

afterEach(() => {
  cleanup();
});

describe("StatusPill", () => {
  it.each(["OPEN", "LOCKED", "RESOLVED", "CANCELLED"])("renders the %s status text", (status) => {
    render(<StatusPill status={status} />);
    expect(screen.getByText(status)).toBeTruthy();
  });

  it("falls back to the neutral style for an unrecognized status", () => {
    render(<StatusPill status="WEIRD" />);
    expect(screen.getByText("WEIRD").className).toContain("text-steel");
  });
});

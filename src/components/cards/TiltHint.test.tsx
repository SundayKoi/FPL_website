import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TiltHint from "./TiltHint";

afterEach(cleanup);

/** jsdom ships no matchMedia, so each test states its own answer. */
function stubHover(hasHover: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("hover: none") ? !hasHover : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe("TiltHint", () => {
  it("tells a phone to tilt, not to hover", () => {
    // The old copy said "Hover to tilt" on every device. A phone has no
    // hover — it has a gyroscope, which is the better trick and was going
    // entirely unadvertised.
    stubHover(false);
    render(<TiltHint />);
    expect(screen.getByText(/tilt your phone · tap to flip/i)).toBeTruthy();
  });

  it("keeps the pointer wording where there is a pointer", () => {
    stubHover(true);
    render(<TiltHint />);
    expect(screen.getByText(/hover to tilt · click to flip/i)).toBeTruthy();
  });
});

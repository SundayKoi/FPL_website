import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockUsePathname } = vi.hoisted(() => ({ mockUsePathname: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: mockUsePathname,
}));

import SupportDevButton from "./SupportDevButton";

describe("SupportDevButton", () => {
  afterEach(() => {
    cleanup();
    mockUsePathname.mockReset();
  });

  it("links visitors to the support section from the bottom-left affordance", () => {
    mockUsePathname.mockReturnValue("/info");
    render(<SupportDevButton />);

    const link = screen.getByRole("link", { name: /support the devs/i });

    expect(link.getAttribute("href")).toBe("/support-devs");
    expect(link.className).toContain("fixed");
    expect(link.className).toContain("bottom-4");
    expect(link.className).toContain("left-4");
    expect(link.className).toContain("h-10");
    expect(link.className).toContain("w-10");
    expect(link.className).toContain("rounded-full");

    const image = link.querySelector("img");
    expect(image?.getAttribute("alt")).toBe("Support the devs");
    expect(image?.className).toContain("object-cover");
  });

  it.each(["/drafter", "/drafter/abc123"]) (
    "hides on drafter route %s",
    (pathname) => {
      mockUsePathname.mockReturnValue(pathname);
      render(<SupportDevButton />);

      expect(screen.queryByRole("link", { name: /support the devs/i })).toBeNull();
    },
  );
});

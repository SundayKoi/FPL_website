import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import SupportDevButton from "./SupportDevButton";

describe("SupportDevButton", () => {
  afterEach(cleanup);

  it("links visitors to the support section from the bottom-left affordance", () => {
    render(<SupportDevButton />);

    const link = screen.getByRole("link", { name: /support the devs/i });

    expect(link.getAttribute("href")).toBe("/info#support-devs");
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
});

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import InfoResourceCard from "./InfoResourceCard";

describe("InfoResourceCard", () => {
  afterEach(cleanup);

  it("renders an external resource card safely", () => {
    render(
      <InfoResourceCard
        label="Payment"
        description="Pay league fees."
        href="https://example.com"
      />,
    );

    const link = screen.getByRole("link", { name: /open resource/i });

    const heading = screen.getByRole("heading", { name: "Payment", level: 2 });

    expect(heading).toBeTruthy();
    expect(heading.className).toContain("text-white");
    expect(link.getAttribute("href")).toBe("https://example.com");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
});

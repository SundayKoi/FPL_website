import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import SupportDevSection from "@/components/info/SupportDevSection";
import SupportDevsRedirect from "./page";

describe("developer support consolidation", () => {
  beforeEach(() => redirectMock.mockClear());

  it("redirects the old route to the support section", () => {
    SupportDevsRedirect();
    expect(redirectMock).toHaveBeenCalledWith("/membership#support-devs");
  });

  it("preserves developer identities, payment destinations, and the optional QR image", () => {
    render(<SupportDevSection />);

    expect(screen.getByText("Dribb")).toBeTruthy();
    expect(screen.getByText("@dribb")).toBeTruthy();
    expect(screen.getByText("Spies")).toBeTruthy();
    expect(screen.getByText("@spiesss")).toBeTruthy();

    const paypal = screen.getByRole("link", { name: "PayPal · Zachari ↗" });
    expect(paypal.getAttribute("href")).toBe("https://www.paypal.com/paypalme/ZBultman");
    for (const [name, href] of [
      ["Zachari Bultman", "https://venmo.com/u/Zachari-Bultman"],
      ["Matthew Wolanski", "https://venmo.com/u/Mwolanski1"],
    ]) {
      const link = screen.getByRole("link", { name: `Venmo · ${name} ↗` });
      expect(link.getAttribute("href")).toBe(href);
      expect(link.getAttribute("rel")).toContain("noopener");
    }

    const qrDisclosure = screen.getByText("Show PayPal QR code").closest("details");
    expect(qrDisclosure).toBeTruthy();
    expect(qrDisclosure?.hasAttribute("open")).toBe(false);
    expect(within(qrDisclosure!).getByAltText("PayPal QR code for Zachari Bultman")).toBeTruthy();
    expect(screen.getByText(/do not register you for league play or assign the separate FPL Premium role/i)).toBeTruthy();
  });
});

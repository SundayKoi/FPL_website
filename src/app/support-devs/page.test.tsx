import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import SupportDevsPage from "./page";

describe("SupportDevsPage", () => {
  afterEach(cleanup);

  it("renders the standalone support page and PayPal destination", () => {
    render(<SupportDevsPage />);

    expect(screen.getByRole("heading", { name: "Support the Devs", level: 1 })).toBeTruthy();
    expect(screen.getByAltText("PayPal QR code for Zachari Bultman")).toBeTruthy();

    const paypalLink = screen.getByRole("link", { name: /support via paypal/i });
    expect(paypalLink.getAttribute("href")).toBe("https://www.paypal.com/paypalme/ZBultman");
    expect(paypalLink.getAttribute("target")).toBe("_blank");
  });
});

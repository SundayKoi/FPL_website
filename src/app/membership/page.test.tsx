import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/premium/preview", () => ({ loadPremiumPaymentHref: async () => "https://example.com/premium" }));
vi.mock("@/components/info/ActivePatrons", () => ({ default: () => null }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    from: () => ({
      select: () => ({ order: async () => ({ data: [], error: null }) }),
    }),
  }),
}));

import MembershipPage from "./page";

describe("MembershipPage", () => {
  it("separates the Premium role, patronage, developer support, and player registration", async () => {
    render(await MembershipPage());

    expect(screen.getByRole("heading", { name: "Membership & support", level: 1 })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Patron + Premium" })).toBeTruthy();
    expect(screen.getByText(/neither payment registers you for a league season/i)).toBeTruthy();
    expect(screen.getByText(/does not grant the Premium role or sign you up for league play/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /get fpl premium/i }).getAttribute("href")).toBe("https://example.com/premium");
    expect(screen.getByRole("link", { name: "PayPal · Zachari ↗" }).getAttribute("href")).toBe("https://www.paypal.com/paypalme/ZBultman");
    expect(screen.getAllByText("What patrons carry")).toHaveLength(1);
  });
});

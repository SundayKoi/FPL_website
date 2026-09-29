import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const useRouterMock = vi.hoisted(() => vi.fn(() => ({ refresh: vi.fn() })));
vi.mock("next/navigation", () => ({ useRouter: useRouterMock }));

vi.mock("@/lib/info/resources", () => ({
  getInfoPageData: async () => ({
    isAdmin: true,
    resources: [
      { id: "payment", slug: "payment", label: "Payment", description: "League fee instructions", href: "https://example.com/pay", sort_order: 1 },
      { id: "masterdoc", slug: "masterdoc", label: "MasterDoc", description: "Shared league sheet", href: "https://example.com/sheet", sort_order: 2 },
      { id: "rulebook", slug: "rulebook", label: "Rulebook source", description: "Original rules", href: "https://example.com/rules", sort_order: 3 },
    ],
  }),
}));

import InfoPage from "./page";

describe("InfoPage", () => {
  it("presents four About destinations and keeps signup as a prominent action", async () => {
    render(await InfoPage());

    expect(screen.getByRole("heading", { name: "About the league", level: 1 })).toBeTruthy();
    const navigation = within(screen.getByRole("navigation", { name: "About sections" }));
    expect(navigation.getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["About the league", "/info"],
      ["Rules", "/rulebook"],
      ["Membership & support", "/membership"],
      ["Cards & currency guide", "/economy"],
    ]);
    expect(screen.getByRole("link", { name: "Sign up" }).getAttribute("href")).toBe("/signup");
  });

  it("keeps configured resource rows public and links editors to the admin content workspace", async () => {
    render(await InfoPage());

    const resources = screen.getByRole("region", { name: "League resources" });
    expect(within(resources).getByRole("heading", { name: "Payment" })).toBeTruthy();
    expect(within(resources).getByRole("heading", { name: "MasterDoc" })).toBeTruthy();
    expect(within(resources).queryByRole("heading", { name: "Rulebook source" })).toBeNull();

    expect(screen.getByRole("link", { name: /manage these site-wide resources in admin/i }).getAttribute("href"))
      .toBe("/admin/content");
    expect(screen.queryByRole("button", { name: "Edit linked resources" })).toBeNull();
  });
});

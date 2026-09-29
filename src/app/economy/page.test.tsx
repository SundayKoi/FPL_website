import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EARN, SPEND } from "@/lib/economy/ledger";
import { GLOSSARY } from "@/lib/site/glossary";
import EconomyPage from "./page";

describe("Cards & currency guide", () => {
  it("keeps ledger, glossary, and legacy-compatible anchors unique on one page", () => {
    const { container } = render(<EconomyPage />);

    expect(screen.getByRole("heading", { name: "Cards & currency guide", level: 1 })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "On this page" })).toBeTruthy();
    const ids = [...container.querySelectorAll<HTMLElement>("[id]")].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const key of ["earn", "spend", ...EARN.map((row) => row.key), ...SPEND.map((row) => row.key)]) {
      expect(ids.filter((id) => id === key), key).toHaveLength(1);
    }
    for (const { key } of GLOSSARY) {
      expect(ids.filter((id) => id === (key === "dust" ? "term-dust" : key)), key).toHaveLength(1);
    }
    expect(screen.getByRole("link", { name: "Dust" }).getAttribute("href")).toBe("#term-dust");
    expect(screen.getByRole("link", { name: "Shine" }).getAttribute("href")).toBe("#shine");
  });
});

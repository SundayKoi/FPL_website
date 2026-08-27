import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Chakra_Petch: () => ({ variable: "--font-chakra" }),
  Saira: () => ({ variable: "--font-saira" }),
  Cinzel: () => ({ variable: "--font-cinzel" }),
  Bangers: () => ({ variable: "--font-bangers" }),
  Pinyon_Script: () => ({ variable: "--font-pinyon" }),
}));

vi.mock("@/components/AuthButton", () => ({
  default: () => null,
}));

vi.mock("@/components/SiteNavigation", () => ({
  default: () => null,
}));

import { metadata } from "./layout";

describe("layout metadata", () => {
  it("describes the Franchise Premier League landing page", () => {
    expect(metadata.description).toBe(
      "Franchise Premier League draft hub for live broadcasts, league updates, and active drafts.",
    );
  });
});

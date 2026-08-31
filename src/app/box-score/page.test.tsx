import { describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect }));

import LegacyBoxScorePage from "./page";

describe("LegacyBoxScorePage", () => {
  it("redirects the old route to Guess the Card", () => {
    LegacyBoxScorePage();
    expect(redirect).toHaveBeenCalledWith("/guess-the-card");
  });
});

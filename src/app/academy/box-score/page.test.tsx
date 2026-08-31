import { describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect }));

import LegacyAcademyBoxScorePage from "./page";

describe("LegacyAcademyBoxScorePage", () => {
  it("redirects the old route to Academy Guess the Card", () => {
    LegacyAcademyBoxScorePage();
    expect(redirect).toHaveBeenCalledWith("/academy/guess-the-card");
  });
});

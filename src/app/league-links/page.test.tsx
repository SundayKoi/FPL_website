import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import LeagueLinksRedirect from "./page";

describe("legacy League Links route", () => {
  beforeEach(() => redirectMock.mockClear());

  it("lands on the consolidated resource section", () => {
    LeagueLinksRedirect();
    expect(redirectMock).toHaveBeenCalledWith("/info#league-resources");
  });
});

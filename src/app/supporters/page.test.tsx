import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import SupportersRedirect from "./page";

describe("legacy patrons route", () => {
  beforeEach(() => redirectMock.mockClear());

  it("lands on the current patron list", () => {
    SupportersRedirect();
    expect(redirectMock).toHaveBeenCalledWith("/membership#patrons");
  });
});

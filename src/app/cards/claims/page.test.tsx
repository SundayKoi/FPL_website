import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect }));

import ClaimApprovalsPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ClaimApprovalsPage", () => {
  it("redirects the legacy cards claims URL to the admin fixture", async () => {
    await ClaimApprovalsPage();

    expect(redirect).toHaveBeenCalledWith("/admin/claims");
  });
});

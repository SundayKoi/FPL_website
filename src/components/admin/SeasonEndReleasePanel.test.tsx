import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createDraft, refresh } = vi.hoisted(() => ({
  createDraft: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/season-end/actions", () => ({
  approveSeasonEndTestAction: vi.fn(),
  createSeasonEndDraftAction: createDraft,
  pauseSeasonEndReleaseAction: vi.fn(),
  rebuildSeasonEndDraftAction: vi.fn(),
  recordSeasonEndVerificationReportAction: vi.fn(),
  setSeasonEndReleaseStateAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/components/cards/SeasonEndPackShop", () => ({ default: () => null }));

import SeasonEndReleasePanel from "./SeasonEndReleasePanel";

beforeEach(() => {
  vi.clearAllMocks();
  createDraft.mockResolvedValue({ ok: false, error: "Cannot rebuild the S5 Season's End catalog: regular-season raw_stats for S5 are empty." });
});

describe("SeasonEndReleasePanel", () => {
  it("shows rebuild failures inline instead of using a browser alert", async () => {
    render(<SeasonEndReleasePanel league="premier" season="S5" release={null} catalog={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Build draft catalog" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("regular-season raw_stats for S5 are empty"));
    expect(refresh).not.toHaveBeenCalled();
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FeaturedDraftSelector from "./FeaturedDraftSelector";

const { upsert, refresh } = vi.hoisted(() => ({
  upsert: vi.fn().mockResolvedValue({ error: null }),
  refresh: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: vi.fn(() => ({ upsert })),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  cleanup();
  upsert.mockClear();
  upsert.mockResolvedValue({ error: null });
  refresh.mockClear();
});

describe("DraftLeagueSelector", () => {
  it("persists the selected league draft and refreshes the route", async () => {
    render(
      <FeaturedDraftSelector
        drafts={[
          { id: "draft-1", name: "Split 5" },
          { id: "draft-2", name: "Split 4" },
        ]}
        premierDraftId={null}
        academyDraftId="draft-2"
      />,
    );

    fireEvent.change(screen.getByLabelText("Premier draft"), { target: { value: "draft-1" } });

    await waitFor(() => {
      expect(upsert).toHaveBeenCalledWith({
        id: 1,
        featured_draft_id: "draft-1",
        updated_at: expect.any(String),
      });
      expect(refresh).toHaveBeenCalled();
    });
  });

  it("persists the Academy mapping independently", async () => {
    render(
      <FeaturedDraftSelector
        drafts={[{ id: "draft-1", name: "S1 Academy" }]}
        premierDraftId="premier"
        academyDraftId={null}
      />,
    );

    fireEvent.change(screen.getByLabelText("Academy draft"), { target: { value: "draft-1" } });

    await waitFor(() => {
      expect(upsert).toHaveBeenCalledWith({
        id: 1,
        academy_draft_id: "draft-1",
        updated_at: expect.any(String),
      });
    });
  });
});

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

describe("FeaturedDraftSelector", () => {
  it("persists the selected draft and refreshes the route", async () => {
    render(
      <FeaturedDraftSelector
        drafts={[
          { id: "draft-1", name: "Split 5" },
          { id: "draft-2", name: "Split 4" },
        ]}
        selectedDraftId={null}
      />,
    );

    fireEvent.change(screen.getByLabelText("Display draft"), { target: { value: "draft-1" } });

    await waitFor(() => {
      expect(upsert).toHaveBeenCalledWith({
        id: 1,
        featured_draft_id: "draft-1",
        updated_at: expect.any(String),
      });
      expect(refresh).toHaveBeenCalled();
    });
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Draft } from "@/lib/draft/types";
import DraftScheduleEditor from "./DraftScheduleEditor";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from }),
}));

const query = {
  update: vi.fn(),
  eq: vi.fn(),
};

Object.values(query).forEach((method) => method.mockReturnValue(query));
from.mockReturnValue(query);

const setupDraft: Draft = {
  id: "draft-season-5",
  name: "FPL Season 5",
  status: "setup",
  countdown_seconds: 60,
  round_minimums: [10, 5, 1],
  current_round: 1,
  current_nominator_team_id: null,
  paused_time_remaining: null,
  created_at: "2026-08-15T00:00:00.000Z",
  starts_at: null,
};

afterEach(() => {
  cleanup();
  from.mockClear();
  Object.values(query).forEach((method) => method.mockClear());
  Object.values(query).forEach((method) => method.mockReturnValue(query));
  vi.restoreAllMocks();
});

describe("DraftScheduleEditor", () => {
  it("saves an Eastern Time start and reports success", async () => {
    query.eq.mockResolvedValue({ error: null });
    render(<DraftScheduleEditor draft={setupDraft} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Draft start (Eastern Time)"), { target: { value: "2026-08-16T20:00" } });
    fireEvent.click(screen.getByRole("button", { name: /Save schedule/i }));

    await waitFor(() => expect(query.update).toHaveBeenCalledWith({ starts_at: "2026-08-17T00:00:00.000Z" }));
    expect(screen.getByText(/Schedule saved/i)).toBeTruthy();
  });

  it("can clear a configured schedule", async () => {
    query.eq.mockResolvedValue({ error: null });
    render(
      <DraftScheduleEditor
        draft={{ ...setupDraft, starts_at: "2026-08-16T00:00:00.000Z" }}
        onSaved={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Clear schedule/i }));

    await waitFor(() => expect(query.update).toHaveBeenCalledWith({ starts_at: null }));
  });

});

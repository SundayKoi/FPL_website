import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Draft } from "@/lib/draft/types";
import DraftListClient from "./DraftListClient";

const { from } = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from }),
}));

const query = {
  select: vi.fn(),
  order: vi.fn(),
  insert: vi.fn(),
  single: vi.fn(),
  delete: vi.fn(),
  eq: vi.fn(),
};

Object.values(query).forEach((method) => method.mockReturnValue(query));
query.select.mockImplementation((columns?: string) =>
  columns === undefined ? Promise.resolve({ data: [draft()], error: null }) : query
);
query.order.mockResolvedValue({ data: [], error: null });
from.mockReturnValue(query);

function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    id: "draft-live",
    name: "Live Draft",
    status: "live",
    countdown_seconds: 60,
    round_minimums: [10, 5, 1],
    current_round: 1,
    current_nominator_team_id: null,
    paused_time_remaining: null,
    created_at: "2026-08-11T00:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  from.mockClear();
  Object.values(query).forEach((method) => method.mockClear());
  query.select.mockImplementation((columns?: string) =>
    columns === undefined ? Promise.resolve({ data: [draft()], error: null }) : query
  );
  query.order.mockResolvedValue({ data: [], error: null });
  vi.restoreAllMocks();
});

describe("DraftListClient", () => {
  it("allows admins to delete a draft even when it is no longer in setup", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DraftListClient initialDrafts={[draft()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(query.delete).toHaveBeenCalled());
    expect(query.eq).toHaveBeenCalledWith("id", "draft-live");
    expect(query.eq).not.toHaveBeenCalledWith("status", "setup");
  });
});

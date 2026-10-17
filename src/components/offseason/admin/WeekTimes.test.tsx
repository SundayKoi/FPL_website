import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OffseasonWeek } from "@/lib/offseason/types";

const { setWeekTimesAction } = vi.hoisted(() => ({ setWeekTimesAction: vi.fn() }));
vi.mock("@/lib/offseason/actions", () => ({ setWeekTimesAction }));

import WeekTimesEditor from "./WeekTimes";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const week: OffseasonWeek = {
  id: "w1",
  event_id: "event",
  week_number: 1,
  status: "setup",
  elimination_per_role: 0,
  main_draft_id: null,
  elimination_draft_id: null,
  draft_at: null,
  games_at: null,
  created_at: "",
};

const set = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("WeekTimesEditor", () => {
  it("saves Eastern times as instants", async () => {
    setWeekTimesAction.mockResolvedValue({ ok: true });
    render(<WeekTimesEditor week={week} />);
    set("Draft", "2026-10-18T20:00");
    set("Games", "2026-10-19T20:00");
    fireEvent.click(screen.getByRole("button", { name: "Save times" }));
    await waitFor(() => expect(setWeekTimesAction).toHaveBeenCalledWith("w1", "2026-10-19T00:00:00.000Z", "2026-10-20T00:00:00.000Z"));
    expect(await screen.findByText("Times saved.")).toBeTruthy();
  });

  it("shows the saved times and clears one left empty", async () => {
    setWeekTimesAction.mockResolvedValue({ ok: true });
    render(<WeekTimesEditor week={{ ...week, draft_at: "2026-10-19T00:00:00Z", games_at: "2026-10-20T00:00:00Z" }} />);
    expect((screen.getByLabelText("Draft") as HTMLInputElement).value).toBe("2026-10-18T20:00");
    set("Games", "");
    fireEvent.click(screen.getByRole("button", { name: "Save times" }));
    await waitFor(() => expect(setWeekTimesAction).toHaveBeenCalledWith("w1", "2026-10-19T00:00:00.000Z", null));
  });

  it("will not save a draft after the games", () => {
    render(<WeekTimesEditor week={week} />);
    set("Draft", "2026-10-20T20:00");
    set("Games", "2026-10-19T20:00");
    fireEvent.click(screen.getByRole("button", { name: "Save times" }));
    expect(screen.getByRole("alert").textContent).toBe("The draft has to be before the games.");
    expect(setWeekTimesAction).not.toHaveBeenCalled();
  });
});

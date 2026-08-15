import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DraftScheduleCountdown from "./DraftScheduleCountdown";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("DraftScheduleCountdown", () => {
  it("shows an upcoming schedule as days, hours, minutes, and seconds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T18:58:29-04:00"));
    render(<DraftScheduleCountdown startsAt="2026-08-15T20:00:00-04:00" label="Season 5 Draft" />);

    act(() => vi.runOnlyPendingTimers());

    expect(screen.getByText("Season 5 Draft")).toBeTruthy();
    expect(screen.getByLabelText("Draft start countdown").textContent).toContain("01");
    expect(screen.getByText("Days")).toBeTruthy();
    expect(screen.getByText("Hours")).toBeTruthy();
    expect(screen.getByText("Minutes")).toBeTruthy();
    expect(screen.getByText("Seconds")).toBeTruthy();
  });

  it("shows live now after the scheduled time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T00:00:00-04:00"));
    render(<DraftScheduleCountdown startsAt="2026-08-15T20:00:00-04:00" />);
    act(() => vi.runOnlyPendingTimers());

    expect(screen.getByText("Live now")).toBeTruthy();
  });

  it("shows not scheduled when no timestamp is configured", () => {
    render(<DraftScheduleCountdown startsAt={null} />);
    expect(screen.getByText("Not scheduled")).toBeTruthy();
  });
});

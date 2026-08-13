import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, act } from "@testing-library/react";
import { LockCountdown } from "./LockCountdown";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("LockCountdown", () => {
  it("ticks down toward the lock time while OPEN", () => {
    const lockAt = new Date(Date.now() + 95_000).toISOString(); // 1:35
    render(<LockCountdown lockAt={lockAt} status="OPEN" />);
    expect(screen.getByText("1:35")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByText("1:30")).toBeTruthy();
  });

  it("shows Locking… once the time passes", () => {
    const lockAt = new Date(Date.now() - 1_000).toISOString();
    render(<LockCountdown lockAt={lockAt} status="OPEN" />);
    expect(screen.getByText(/locking/i)).toBeTruthy();
  });

  it("renders nothing when the market is not OPEN", () => {
    const lockAt = new Date(Date.now() + 60_000).toISOString();
    const { container } = render(<LockCountdown lockAt={lockAt} status="LOCKED" />);
    expect(container.firstChild).toBeNull();
  });
});

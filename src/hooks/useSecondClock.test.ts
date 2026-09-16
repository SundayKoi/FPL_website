import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSecondClock } from "./useSecondClock";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-01T12:00:00Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useSecondClock", () => {
  it("shares a timer across consumers and keeps ticking until the last unmount", () => {
    const first = renderHook(() => useSecondClock());
    const second = renderHook(() => useSecondClock());
    expect(first.result.current).toBe(0);
    expect(vi.getTimerCount()).toBe(2); // Initial update and one shared interval.

    act(() => vi.advanceTimersByTime(0));
    expect(first.result.current).toBe(Date.now());
    expect(second.result.current).toBe(first.result.current);
    expect(vi.getTimerCount()).toBe(1);

    first.unmount();
    act(() => vi.advanceTimersByTime(1000));
    expect(second.result.current).toBe(Date.now());
    expect(vi.getTimerCount()).toBe(1);

    second.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts fresh after all consumers unmount instead of showing a stale clock", () => {
    const first = renderHook(() => useSecondClock());
    act(() => vi.advanceTimersByTime(0));
    first.unmount();
    act(() => vi.advanceTimersByTime(60_000));

    const next = renderHook(() => useSecondClock());
    expect(next.result.current).toBe(0);
    act(() => vi.advanceTimersByTime(0));
    expect(next.result.current).toBe(Date.now());
  });

  it("cleans up when unmounted before the initial tick", () => {
    const view = renderHook(() => useSecondClock());
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCountdown } from "./useCountdown";

describe("useCountdown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("counts down and flags expiry", () => {
    vi.setSystemTime(0);
    const closes = new Date(5_000).toISOString();
    const { result } = renderHook(() => useCountdown(closes, 0));
    expect(result.current.secondsLeft).toBe(5);
    act(() => vi.advanceTimersByTime(5_100));
    expect(result.current.secondsLeft).toBe(0);
    expect(result.current.expired).toBe(true);
  });

  it("does not rerender between displayed seconds and stops polling at expiry", () => {
    vi.setSystemTime(0);
    let renders = 0;
    const { result, unmount } = renderHook(() => {
      renders += 1;
      return useCountdown(new Date(2000).toISOString(), 0);
    });
    act(() => vi.advanceTimersByTime(750));
    expect(renders).toBe(1);
    act(() => vi.advanceTimersByTime(1250));
    expect(result.current.expired).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    unmount();
  });

  it("immediately applies clock corrections and restarts for an extended deadline", () => {
    vi.setSystemTime(0);
    const { result, rerender, unmount } = renderHook(
      ({ deadline, offset }) => useCountdown(new Date(deadline).toISOString(), offset),
      { initialProps: { deadline: 5000, offset: 0 } },
    );
    rerender({ deadline: 5000, offset: 5000 });
    expect(result.current).toEqual({ secondsLeft: 0, expired: true });
    expect(vi.getTimerCount()).toBe(0);
    rerender({ deadline: 7000, offset: 5000 });
    expect(result.current.secondsLeft).toBe(2);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("null closesAt is inert", () => {
    const { result } = renderHook(() => useCountdown(null, 0));
    expect(result.current).toEqual({ secondsLeft: 0, expired: false });
  });
});

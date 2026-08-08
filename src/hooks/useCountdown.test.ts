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

  it("null closesAt is inert", () => {
    const { result } = renderHook(() => useCountdown(null, 0));
    expect(result.current).toEqual({ secondsLeft: 0, expired: false });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flashTitle } from "./turnAlerts";

const BELL = "🔔 Your turn to draft!";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "hasFocus").mockReturnValue(false);
  document.title = "FPL";
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("flashTitle", () => {
  it("blinks the title eight times, then puts it back", () => {
    flashTitle();
    vi.advanceTimersByTime(900);
    expect(document.title).toBe(BELL);
    vi.advanceTimersByTime(900);
    expect(document.title).toBe("FPL");
    vi.advanceTimersByTime(900 * 6);
    expect(document.title).toBe("FPL");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops early and restores the title when told to", () => {
    const stop = flashTitle();
    vi.advanceTimersByTime(900);
    expect(document.title).toBe(BELL);
    stop();
    expect(document.title).toBe("FPL");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops as soon as the captain is looking at the tab", () => {
    flashTitle();
    vi.mocked(document.hasFocus).mockReturnValue(true);
    vi.advanceTimersByTime(900);
    expect(document.title).toBe("FPL");
    expect(vi.getTimerCount()).toBe(0);
  });
});

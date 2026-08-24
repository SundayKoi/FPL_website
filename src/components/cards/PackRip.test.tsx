import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PackRip from "./PackRip";

const { ripOpen, ripTick } = vi.hoisted(() => ({ ripOpen: vi.fn(), ripTick: vi.fn() }));

vi.mock("@/lib/packs/sounds", () => ({ ripOpen, ripTick, revealTone: vi.fn(), setMuted: vi.fn() }));

/** jsdom has no matchMedia at all, so every test states its own answer. */
function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

function renderRip(props: Partial<ComponentProps<typeof PackRip>> = {}) {
  const onOpened = vi.fn();
  const result = render(
    <PackRip bestRarity="epic" hasSigned={false} muted={false} onOpened={onOpened} {...props} />,
  );
  return { ...result, onOpened };
}

/** The pack itself — the only thing on the stage with an accessible name. */
function pack() {
  return screen.getByRole("button", { name: /rip it open/i });
}

/** Clicks are the accessibility path: three of them tear the pack. */
function clickPack(times: number) {
  for (let i = 0; i < times; i += 1) fireEvent.click(pack());
}

beforeEach(() => {
  vi.useFakeTimers();
  stubReducedMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  cleanup();
  ripOpen.mockReset();
  ripTick.mockReset();
});

describe("PackRip", () => {
  it("renders sealed, glowing in the best pull's color, with nothing revealed", () => {
    const { container, onOpened } = renderRip({ bestRarity: "legendary" });

    // The aura color is the one thing the sealed pack is allowed to leak.
    expect(container.querySelector(".pack-rarity-legendary")).toBeTruthy();
    expect(container.querySelector(".pack-rarity-common")).toBeNull();
    expect(pack()).toBeTruthy();
    expect(onOpened).not.toHaveBeenCalled();
  });

  it("sparkles only when something in the pack is signed", () => {
    const { container, unmount } = renderRip({ hasSigned: false });
    expect(container.querySelectorAll(".pack-spark")).toHaveLength(0);
    unmount();

    const signed = renderRip({ hasSigned: true });
    expect(signed.container.querySelectorAll(".pack-spark").length).toBeGreaterThan(0);
  });

  it("opens on the third click, bursting in the pack's rarity", () => {
    const { onOpened } = renderRip({ bestRarity: "rare", hasSigned: true });

    clickPack(2);
    expect(ripOpen).not.toHaveBeenCalled();
    expect(onOpened).not.toHaveBeenCalled();

    clickPack(1);
    expect(ripOpen).toHaveBeenCalledWith("rare", true);
    // The burst plays before the cards take over.
    expect(onOpened).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it("tears open under a held Enter", () => {
    const { onOpened } = renderRip();

    for (let press = 0; press < 8; press += 1) fireEvent.keyDown(pack(), { key: "Enter" });

    expect(ripOpen).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it("skips the rip entirely when the user asked for less motion", () => {
    stubReducedMotion(true);
    const { container, onOpened } = renderRip();

    expect(onOpened).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".pack-stage")).toBeNull();
    expect(ripOpen).not.toHaveBeenCalled();
  });

  it("stays silent when muted, but still opens", () => {
    const { onOpened } = renderRip({ muted: true });

    clickPack(3);
    expect(ripTick).not.toHaveBeenCalled();
    expect(ripOpen).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it("crackles as the tear widens and opens once the foil gives way", () => {
    const { onOpened } = renderRip();
    const target = pack();

    fireEvent.pointerDown(target, { pointerId: 1, clientX: 0 });
    fireEvent.pointerMove(target, { pointerId: 1, clientX: 60 });
    expect(ripTick).toHaveBeenCalled();
    expect(ripOpen).not.toHaveBeenCalled();

    // 240px of drag is a full tear; 85% of it is enough.
    fireEvent.pointerMove(target, { pointerId: 1, clientX: 230 });
    fireEvent.pointerUp(target, { pointerId: 1 });
    expect(ripOpen).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(onOpened).toHaveBeenCalledTimes(1);
  });
});

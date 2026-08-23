import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DustControls, { type DustCopy } from "./DustControls";

const { dustCardAction } = vi.hoisted(() => ({ dustCardAction: vi.fn() }));
vi.mock("@/lib/trades/actions", () => ({ dustCardAction }));

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

// One of each thing the value table cares about: a plain common, a foil
// epic, and the signed legendary nobody should ever dust.
const copies: DustCopy[] = [
  { id: 1, tier: "silver", foil: false, signed: false, editionWeek: "2026-08-17" },
  { id: 2, tier: "diamond", foil: true, signed: false, editionWeek: "2026-08-24" },
  { id: 3, tier: "challenger", foil: false, signed: true, editionWeek: "2026-08-31" },
];

function open() {
  render(<DustControls playerName="Chaseworthy" copies={copies} />);
  fireEvent.click(screen.getByRole("button", { name: "Manage copies" }));
}

/** Click and let the (mocked, already-resolved) server action settle. */
async function click(button: HTMLElement) {
  await act(async () => {
    fireEvent.click(button);
  });
}

beforeEach(() => {
  dustCardAction.mockReset().mockResolvedValue({ ok: true, value: 10, balance: 1010 });
  refresh.mockReset();
});

afterEach(cleanup);

describe("DustControls", () => {
  it("keeps the drawer shut until asked", () => {
    render(<DustControls playerName="Chaseworthy" copies={copies} />);

    expect(screen.queryByText(/Dust ·/)).toBeNull();
    expect(screen.getByRole("button", { name: "Manage copies" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("lists every copy with its edition, tier and dust value", () => {
    open();

    // silver = common $10; diamond = epic $60 doubled for foil; challenger =
    // legendary $150 × 5 for the autograph.
    expect(screen.getByText("Dust · $10")).toBeTruthy();
    expect(screen.getByText("Dust · $120")).toBeTruthy();
    expect(screen.getByText("Dust · $750")).toBeTruthy();

    expect(screen.getByText("WK Aug 17")).toBeTruthy();
    expect(screen.getByText("Silver")).toBeTruthy();
    expect(screen.getByText("✍")).toBeTruthy();
    expect(screen.getByText("✦")).toBeTruthy();
  });

  it("needs two clicks and then dusts exactly once", async () => {
    open();

    await click(screen.getByText("Dust · $120"));
    expect(dustCardAction).not.toHaveBeenCalled();
    expect(screen.getByText("Confirm $120?")).toBeTruthy();

    await click(screen.getByText("Confirm $120?"));
    expect(dustCardAction).toHaveBeenCalledTimes(1);
    expect(dustCardAction).toHaveBeenCalledWith(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    // disarmed again — the button is back to its resting label
    expect(screen.getByText("Dust · $120")).toBeTruthy();
  });

  it("disarms a primed copy when a different one is clicked", async () => {
    open();

    await click(screen.getByText("Dust · $750"));
    expect(screen.getByText("Confirm $750?")).toBeTruthy();

    await click(screen.getByText("Dust · $10"));
    expect(screen.queryByText("Confirm $750?")).toBeNull();
    expect(screen.getByText("Confirm $10?")).toBeTruthy();
    expect(dustCardAction).not.toHaveBeenCalled();
  });

  it("surfaces the action's error and doesn't refresh", async () => {
    dustCardAction.mockResolvedValue({ ok: false, error: "That card is fielded in this week's lineup." });
    open();

    await click(screen.getByText("Dust · $10"));
    await click(screen.getByText("Confirm $10?"));

    expect(screen.getByText("That card is fielded in this week's lineup.")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });
});

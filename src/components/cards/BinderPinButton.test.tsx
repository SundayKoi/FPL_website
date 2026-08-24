import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { toggle } = vi.hoisted(() => ({
  toggle: vi.fn(async () => ({ ok: true as const, pinned: true })),
}));
vi.mock("@/lib/binder/actions", () => ({ toggleBinderCardAction: toggle }));

import BinderPinButton from "./BinderPinButton";

describe("BinderPinButton", () => {
  beforeEach(() => toggle.mockClear());
  afterEach(cleanup);

  it("pins a copy without asking which slot", async () => {
    render(<BinderPinButton inventoryId={7} pinned={false} playerName="Ari" />);

    const button = screen.getByRole("button", { name: /put ari in your binder/i });
    fireEvent.click(button);
    await waitFor(() => expect(toggle).toHaveBeenCalledWith(7));
    expect(screen.getByRole("button", { name: /take ari out/i })).toBeTruthy();
  });

  it("reads as pressed when the copy is already on display", () => {
    render(<BinderPinButton inventoryId={7} pinned playerName="Ari" />);
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
  });

  it("rolls back and explains a full binder in place", async () => {
    toggle.mockResolvedValueOnce({ ok: false, error: "Your binder is full (6 cards). Take one out first." } as never);
    render(<BinderPinButton inventoryId={7} pinned={false} playerName="Ari" />);

    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText(/binder is full/i)).toBeTruthy());
    // A full binder is a normal state, so the star goes back rather than
    // leaving the shelf claiming a card is on display.
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false");
  });
})

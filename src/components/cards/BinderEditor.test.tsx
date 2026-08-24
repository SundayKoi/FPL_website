import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { setSlot, setTitle } = vi.hoisted(() => ({
  setSlot: vi.fn(async () => ({ ok: true as const })),
  setTitle: vi.fn(async () => ({ ok: true as const })),
}));
vi.mock("@/lib/binder/actions", () => ({
  setBinderSlotAction: setSlot,
  setBinderTitleAction: setTitle,
}));

import BinderEditor, { type BinderOption } from "./BinderEditor";

const options: BinderOption[] = [
  { inventoryId: 1, playerName: "Ari", editionWeek: "2026-08-17", tier: "gold", foil: true, signed: false },
  { inventoryId: 2, playerName: "Bo", editionWeek: "2026-08-17", tier: "silver", foil: false, signed: false },
];

function renderEditor(slots: (number | null)[] = [null, null, null, null, null, null]) {
  return render(<BinderEditor slots={slots} options={options} token="tok" title={null} />);
}

describe("BinderEditor", () => {
  beforeEach(() => {
    setSlot.mockClear();
    setTitle.mockClear();
  });
  afterEach(cleanup);

  it("labels a copy well enough to tell two prints apart", () => {
    renderEditor();
    expect(screen.getAllByRole("option", { name: "Ari · Gold · WK Aug 17 · Foil" }).length).toBeGreaterThan(0);
  });

  it("pins a copy to the slot it was chosen in", async () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText("Slot 2"), { target: { value: "1" } });
    await waitFor(() => expect(setSlot).toHaveBeenCalledWith(2, 1));
  });

  it("clears the old slot when a copy moves, since one copy can't fill two", async () => {
    renderEditor([1, null, null, null, null, null]);
    fireEvent.change(screen.getByLabelText("Slot 3"), { target: { value: "1" } });
    await waitFor(() => expect(setSlot).toHaveBeenCalledWith(3, 1));
    expect((screen.getByLabelText("Slot 1") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Slot 3") as HTMLSelectElement).value).toBe("1");
  });

  it("empties a slot without pinning anything", async () => {
    renderEditor([1, null, null, null, null, null]);
    fireEvent.change(screen.getByLabelText("Slot 1"), { target: { value: "" } });
    await waitFor(() => expect(setSlot).toHaveBeenCalledWith(1, null));
  });

  it("still shows the binder and its share link with an empty collection", () => {
    render(<BinderEditor slots={[null, null, null, null, null, null]} options={[]} token="tok" title={null} />);

    // Discoverable before you own anything — otherwise the only way to
    // learn the binder exists is to already have cards in it.
    expect(screen.getByText(/open a pack/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /view binder/i }).getAttribute("href")).toBe("/binder/tok");
    expect(screen.queryByLabelText("Slot 1")).toBeNull();
  });

  it("rolls the slot back and explains when the server refuses", async () => {
    setSlot.mockResolvedValueOnce({ ok: false, error: "That card isn't in your collection." } as never);
    renderEditor();
    fireEvent.change(screen.getByLabelText("Slot 1"), { target: { value: "1" } });
    await waitFor(() => expect(screen.getByText("That card isn't in your collection.")).toBeTruthy());
    expect((screen.getByLabelText("Slot 1") as HTMLSelectElement).value).toBe("");
  });
});

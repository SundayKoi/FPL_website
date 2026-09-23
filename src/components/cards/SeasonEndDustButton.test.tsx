import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { quote, dust, refresh } = vi.hoisted(() => ({ quote: vi.fn(), dust: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/season-end/commerce-actions", () => ({
  quoteSeasonEndDustAction: quote,
  dustSeasonEndCopyAction: dust,
}));

import SeasonEndDustButton from "./SeasonEndDustButton";

describe("SeasonEndDustButton", () => {
  beforeEach(() => {
    quote.mockReset();
    dust.mockReset();
    refresh.mockReset();
    vi.restoreAllMocks();
  });

  it("quotes the owned copy and dusts only after confirmation", async () => {
    quote.mockResolvedValue({ ok: true, value: 1200 });
    dust.mockResolvedValue({ ok: true, value: 1200 });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SeasonEndDustButton inventoryId={42} />);
    fireEvent.click(screen.getByRole("button", { name: "Dust copy" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(quote).toHaveBeenCalledWith(42);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("1,200 betting dollars"));
    expect(dust).toHaveBeenCalledWith(42);
  });

  it("leaves the copy alone when confirmation is declined", async () => {
    quote.mockResolvedValue({ ok: true, value: 20 });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<SeasonEndDustButton inventoryId={43} />);
    fireEvent.click(screen.getByRole("button", { name: "Dust copy" }));
    await waitFor(() => expect(quote).toHaveBeenCalledWith(43));
    expect(dust).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});

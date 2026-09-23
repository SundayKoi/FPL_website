import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { save, run, refresh } = vi.hoisted(() => ({ save: vi.fn(), run: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/season-end/autoDust-actions", () => ({ saveSeasonEndAutoDustAction: save, runSeasonEndAutoDustAction: run }));

import SeasonEndAutoDustPanel from "./SeasonEndAutoDustPanel";

describe("SeasonEndAutoDustPanel", () => {
  beforeEach(() => { save.mockReset(); run.mockReset(); refresh.mockReset(); });

  it("saves the league rule and requires a second click to dust existing duplicates", async () => {
    save.mockResolvedValue({ ok: true, enabled: true });
    run.mockResolvedValue({ ok: true, result: { dusted: 2, value: 40, remaining: 0, balance: 540, ids: [2, 3] } });
    render(<SeasonEndAutoDustPanel league="academy" initialEnabled={false} duplicateCount={2} />);
    const toggle = screen.getByRole("checkbox", { name: "Auto-dust future duplicates" });
    fireEvent.click(toggle);
    await waitFor(() => expect(save).toHaveBeenCalledWith("academy", true));
    const button = screen.getByRole("button", { name: "Dust 2 now" });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    expect(run).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Really dust 2?" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(run).toHaveBeenCalledWith("academy");
    expect(screen.getByRole("status").textContent).toContain("Dusted 2 for +40");
  });
});

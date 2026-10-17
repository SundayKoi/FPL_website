import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OffseasonCopy } from "@/lib/offseason/packs";

const { openOffseasonPackAction, refresh } = vi.hoisted(() => ({ openOffseasonPackAction: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/offseason/actions", () => ({ openOffseasonPackAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/components/cards/PlayerCard3D", () => ({
  default: ({ card, forceFoil }: { card: { name: string }; forceFoil?: boolean }) => (
    <div data-testid="card" data-foil={forceFoil ? "yes" : "no"}>
      {card.name}
    </div>
  ),
}));

import PackOpener from "./PackOpener";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const copy = (id: number, finish: Partial<OffseasonCopy> = {}): OffseasonCopy => ({
  id,
  weekNumber: 1,
  foil: false,
  shiny: false,
  signed: false,
  card: { name: `Player ${id}` } as OffseasonCopy["card"],
  ...finish,
});

const openButton = () => screen.getByRole("button", { name: /open a pack/i });

describe("PackOpener", () => {
  it("opens a pack, shows its five cards and what is left", async () => {
    openOffseasonPackAction.mockResolvedValue({
      ok: true,
      remaining: 1900,
      weekNumber: 1,
      copies: [copy(1, { foil: true, signed: true }), copy(2, { shiny: true }), copy(3), copy(4), copy(5)],
    });
    render(<PackOpener remaining={2000} />);
    expect(screen.getByText("$2,000")).toBeTruthy();
    fireEvent.click(openButton());
    const pack = await screen.findByRole("region", { name: "Your pack" });
    expect(pack.querySelectorAll("[data-testid=card]")).toHaveLength(5);
    expect(screen.getByText("$1,900")).toBeTruthy();
    expect(screen.getByText("Signed")).toBeTruthy();
    expect(screen.getByText("Shiny")).toBeTruthy();
    expect(screen.getAllByTestId("card")[0].dataset.foil).toBe("yes");
    expect(refresh).toHaveBeenCalled();
  });

  it("retries a lost answer with the same request, so it can't buy twice", async () => {
    openOffseasonPackAction.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({ ok: true, remaining: 1900, weekNumber: 1, copies: [copy(1)] });
    render(<PackOpener remaining={2000} />);
    fireEvent.click(openButton());
    expect((await screen.findByRole("alert")).textContent).toMatch(/won't be charged twice/);
    await waitFor(() => expect((openButton() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(openButton());
    await screen.findByRole("region", { name: "Your pack" });
    const [first, second] = openOffseasonPackAction.mock.calls.map((call) => call[0]);
    expect(second).toBe(first);
  });

  it("shows the database's reason and starts a fresh request next time", async () => {
    openOffseasonPackAction.mockResolvedValue({ ok: false, error: "this week's $2,000 is spent; it resets on Monday" });
    render(<PackOpener remaining={100} />);
    fireEvent.click(openButton());
    expect((await screen.findByRole("alert")).textContent).toBe("this week's $2,000 is spent; it resets on Monday");
    await waitFor(() => expect((openButton() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(openButton());
    await waitFor(() => expect(openOffseasonPackAction).toHaveBeenCalledTimes(2));
    const [first, second] = openOffseasonPackAction.mock.calls.map((call) => call[0]);
    expect(second).not.toBe(first);
  });

  it("is spent out once the allowance can't cover a pack", () => {
    render(<PackOpener remaining={50} />);
    expect((openButton() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/resets on Monday/)).toBeTruthy();
  });
});

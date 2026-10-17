import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { signCardAction, refresh } = vi.hoisted(() => ({ signCardAction: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/offseason/actions", () => ({ signCardAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/components/cards/PlayerCard3D", () => ({
  default: ({ card }: { card: { name: string; autograph?: string | null } }) => (
    <div data-testid="card" data-autograph={card.autograph ?? ""}>
      {card.name}
    </div>
  ),
}));

import { ClaimAndSign, SignOwnCard } from "./SignCard";

const INK = "data:image/png;base64,iVBORw0KGgo=";
let drawn = INK;

// jsdom has no canvas; the pad only needs a context that takes strokes.
beforeEach(() => {
  drawn = INK;
  const ctx = { scale: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), clearRect: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => drawn);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const draw = () => {
  const pad = screen.getByLabelText(/signature pad/i);
  fireEvent.pointerDown(pad, { clientX: 10, clientY: 10, pointerId: 1 });
  fireEvent.pointerUp(pad, { pointerId: 1 });
};

const card = { name: "Signer", season: "S6" } as Parameters<typeof SignOwnCard>[0]["card"];

describe("signing an offseason card", () => {
  it("saves the drawn signature and puts it on the player's card", async () => {
    signCardAction.mockResolvedValue({ ok: true });
    render(<SignOwnCard eventId="event" card={card} signature={null} />);
    const save = screen.getByRole("button", { name: "Save signature" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    draw();
    fireEvent.click(save);
    expect((await screen.findByRole("status")).textContent).toMatch(/Signed/);
    expect(signCardAction).toHaveBeenCalledWith({ eventId: "event", signature: INK, riotId: undefined });
    expect(screen.getByTestId("card").dataset.autograph).toBe(INK);
    expect(refresh).toHaveBeenCalled();
  });

  it("shows a saved signature before the card exists", () => {
    render(<SignOwnCard eventId="event" card={null} signature={INK} />);
    expect(screen.queryByTestId("card")).toBeNull();
    expect(screen.getByRole("img", { name: "Your saved signature" }).getAttribute("src")).toBe(INK);
    expect(screen.getByText(/appears after your first rated game/)).toBeTruthy();
  });

  it("turns away a signature too big to store", () => {
    drawn = `data:image/png;base64,${"A".repeat(80000)}`;
    render(<SignOwnCard eventId="event" card={card} signature={null} />);
    draw();
    fireEvent.click(screen.getByRole("button", { name: "Save signature" }));
    expect(screen.getByRole("alert").textContent).toMatch(/too detailed/);
    expect(signCardAction).not.toHaveBeenCalled();
  });

  it("finds an unclaimed card by Riot ID and claims it with the signature", async () => {
    signCardAction.mockResolvedValue({ ok: true });
    render(<ClaimAndSign eventId="event" spots={[{ displayName: "Craig", riotId: "Bleedinwolves#IlIll", role: "top" }]} />);
    fireEvent.change(screen.getByLabelText("Riot ID"), { target: { value: "nobody#NA1" } });
    fireEvent.click(screen.getByRole("button", { name: "Find my card" }));
    expect(screen.getByText(/No unclaimed card has that Riot ID/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Riot ID"), { target: { value: "bleedinwolves #ilill" } });
    fireEvent.click(screen.getByRole("button", { name: "Find my card" }));
    expect(screen.getByText("Craig")).toBeTruthy();
    draw();
    fireEvent.click(screen.getByRole("button", { name: "Save signature" }));
    await screen.findByRole("status");
    expect(signCardAction).toHaveBeenCalledWith({ eventId: "event", signature: INK, riotId: "Bleedinwolves#IlIll" });
  });
});

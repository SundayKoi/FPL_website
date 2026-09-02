import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WantsBoard, { byBounty, matchingCopies, type BoardWant } from "./WantsBoard";
import type { TradeCardOption } from "./TradeBuilder";

const { cancelWant, createWant, fillWant } = vi.hoisted(() => ({
  cancelWant: vi.fn(),
  createWant: vi.fn(),
  fillWant: vi.fn(),
}));
vi.mock("@/lib/market/actions", () => ({ cancelWant, createWant, fillWant }));

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const ME = "me-1";

function want(over: Partial<BoardWant> = {}): BoardWant {
  return {
    id: 9,
    discordId: "them-1",
    username: "Nina",
    slug: "doug-na1",
    playerName: "Doug",
    bounty: 800,
    note: null,
    status: "open",
    filledByUsername: null,
    ...over,
  };
}

function option(id: number, slug: string, playerName: string): TradeCardOption {
  return {
    id,
    slug,
    playerName,
    role: "Mid",
    overall: 80,
    tier: "gold",
    foil: false,
    signed: false,
    altArt: false,
    editionWeek: "2026-08-24",
    card: null,
  };
}

beforeEach(() => {
  createWant.mockReset().mockResolvedValue({ ok: true, id: 1 });
  cancelWant.mockReset().mockResolvedValue({ ok: true });
  fillWant.mockReset().mockResolvedValue({ ok: true });
  refresh.mockReset();
});

afterEach(cleanup);

describe("byBounty", () => {
  it("puts the biggest money first", () => {
    const rows = [want({ id: 1, bounty: 100 }), want({ id: 2, bounty: 900 })].sort(byBounty);
    expect(rows.map((row) => row.id)).toEqual([2, 1]);
  });
});

describe("matchingCopies", () => {
  it("keeps only copies of the player asked for", () => {
    const inventory = [option(1, "doug-na1", "Doug"), option(2, "spies-na1", "Spies")];
    expect(matchingCopies(want(), inventory).map((card) => card.id)).toEqual([1]);
  });

  it("drops copies that cannot change hands", () => {
    const inventory = [option(1, "doug-na1", "Doug"), option(2, "doug-na1", "Doug")];
    expect(matchingCopies(want(), inventory, new Set([1])).map((card) => card.id)).toEqual([2]);
  });
});

describe("WantsBoard", () => {
  const props = {
    players: [{ slug: "doug-na1", name: "Doug" }],
    viewerDiscordId: ME,
    league: "premier" as const,
  };

  it("posts a bounty on the chosen player", async () => {
    render(<WantsBoard {...props} wants={[]} myInventory={[]} />);

    fireEvent.change(screen.getByLabelText("Player wanted"), { target: { value: "doug-na1" } });
    fireEvent.change(screen.getByLabelText("Bounty"), { target: { value: "800" } });
    fireEvent.click(screen.getByRole("button", { name: "Post want" }));

    await waitFor(() =>
      expect(createWant).toHaveBeenCalledWith({ slug: "doug-na1", bounty: 800, note: "", league: "premier" }),
    );
  });

  it("refuses a bounty that isn't a whole number, without a round trip", async () => {
    render(<WantsBoard {...props} wants={[]} myInventory={[]} />);

    fireEvent.change(screen.getByLabelText("Player wanted"), { target: { value: "doug-na1" } });
    fireEvent.change(screen.getByLabelText("Bounty"), { target: { value: "8.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Post want" }));

    expect(await screen.findByText(/whole number/i)).toBeTruthy();
    expect(createWant).not.toHaveBeenCalled();
  });

  it("offers no Fill button when you have no copy of them", () => {
    render(<WantsBoard {...props} wants={[want()]} myInventory={[]} />);

    const button = screen.getByRole("button", { name: "No copy" });
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("makes you pick which of your copies answers it", async () => {
    render(
      <WantsBoard {...props} wants={[want()]} myInventory={[option(11, "doug-na1", "Doug")]} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Fill" }));
    // Opening the picker sells nothing; choosing a copy is the commit.
    expect(fillWant).not.toHaveBeenCalled();

    const picker = await screen.findByTestId("fill-picker");
    fireEvent.click(within(picker).getByRole("button", { name: /sell for \$800/i }));

    await waitFor(() => expect(fillWant).toHaveBeenCalledWith(9, 11));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("lets you withdraw your own want instead of filling it", async () => {
    render(<WantsBoard {...props} wants={[want({ discordId: ME })]} myInventory={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));

    await waitFor(() => expect(cancelWant).toHaveBeenCalledWith(9));
  });

  it("renders the action's refusal inline", async () => {
    fillWant.mockResolvedValue({ ok: false, error: "That card is out on an expedition." });
    render(<WantsBoard {...props} wants={[want()]} myInventory={[option(11, "doug-na1", "Doug")]} />);

    fireEvent.click(screen.getByRole("button", { name: "Fill" }));
    fireEvent.click(await screen.findByRole("button", { name: /sell for \$800/i }));

    expect(await screen.findByText("That card is out on an expedition.")).toBeTruthy();
  });
});

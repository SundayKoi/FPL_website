import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CampPanel, { ForgedPolicyToggle } from "./CampPanel";
import { EMPTY_CAMP, FORGE_HOLD, type CampState } from "@/lib/expeditions/camp";
import type { Accolade } from "@/lib/expeditions/standings";

const camp = (over: Partial<CampState> = {}): CampState => ({ ...EMPTY_CAMP, ...over });

function renderPanel(props: Partial<Parameters<typeof CampPanel>[0]> = {}) {
  const onUpgrade = vi.fn(async () => null as string | null);
  const onForge = vi.fn(async () => null as string | null);
  const view = render(<CampPanel camp={camp()} fragments={5} balance={10000} onUpgrade={onUpgrade} onForge={onForge} {...props} />);
  return { ...view, onUpgrade, onForge };
}

/** Every button in the panel, and whether each disabled one says why in
 *  visible text beside it (the Phase 8 check, run here in jsdom). */
function disabledWithoutReason(root: HTMLElement): HTMLButtonElement[] {
  return [...root.querySelectorAll("button")].filter((button) => {
    if (!button.disabled) return false;
    const reason = button.parentElement?.querySelector("[data-reason]");
    return !reason || (reason.textContent ?? "").trim().length === 0;
  });
}

describe("CampPanel", () => {
  it("renders nothing when the camp is not here", () => {
    const { container } = renderPanel({ camp: null });
    expect(container.innerHTML).toBe("");
  });

  it("states every upgrade, price and effect in plain words, the game's word second", () => {
    renderPanel();
    expect(screen.getByTestId("camp-slot-next").textContent).toContain("A second scouting squad: send two Scouting Runs at once.");
    expect(screen.getByTestId("camp-slot-level").textContent).toBe("Squad slot · not built yet");
    expect(screen.getByRole("button", { name: "Build a second scouting squad — $1,500 + 1 map fragment" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Build a tent — $600" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Build a forge — $800 + 1 map fragment" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Build a trophy wall — $300" })).toBeTruthy();
    expect(screen.getByTestId("camp-tent-next").textContent).toContain("wound a card or leave it Haunted");
    expect(screen.getByTestId("camp-wallet").textContent).toBe("You have $10,000 and 5 map fragments.");
  });

  it("has exactly one primary action, and every button is a 44px target", () => {
    const { container } = renderPanel();
    expect(container.querySelectorAll(".btn-coral")).toHaveLength(1);
    // The first thing that can be bought right now: the slot.
    expect(screen.getByTestId("camp-buy-slot").className).toContain("btn-coral");
    for (const button of container.querySelectorAll("button")) expect(button.className).toContain("min-h-11");
  });

  it("moves the primary action to the first thing the wallet can cover", () => {
    const { container } = renderPanel({ balance: 700, fragments: 0 });
    expect(container.querySelectorAll(".btn-coral")).toHaveLength(1);
    expect(screen.getByTestId("camp-buy-tent").className).toContain("btn-coral");
  });

  it("says why beside every disabled button", () => {
    const { container } = renderPanel({ balance: 200, fragments: 0 });
    expect((screen.getByTestId("camp-buy-slot") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("camp-buy-slot-reason").textContent).toBe("You have $200; this costs $1,500. You have 0 map fragments; this needs 1.");
    expect(screen.getByTestId("camp-buy-tent-reason").textContent).toBe("You have $200; this costs $600.");
    expect(disabledWithoutReason(container)).toEqual([]);
    // Nothing affordable: no primary action at all, rather than a coral
    // button that cannot be pressed.
    expect(container.querySelectorAll(".btn-coral")).toHaveLength(0);
  });

  it("buys the level it showed, and shows a refusal where the buttons are", async () => {
    const { onUpgrade } = renderPanel({ camp: camp({ tent: 1 }) });
    onUpgrade.mockResolvedValueOnce("The price changed while you were looking. Refresh your camp and try again.");
    fireEvent.click(screen.getByRole("button", { name: "Build a bigger tent — $1,200 + 1 map fragment" }));
    expect(onUpgrade).toHaveBeenCalledWith("tent", 2);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("The price changed"));
  });

  it("shows what is built, and stops selling at the top level", () => {
    renderPanel({ camp: camp({ tent: 2, slots: 1 }) });
    const built = screen.getByTestId("camp-tent-built").textContent ?? "";
    expect(built).toContain("A tent: the first time");
    expect(built).toContain("A bigger tent: also pays the first toll");
    expect(screen.getByTestId("camp-tent-level").textContent).toBe("Tent · level 2 of 2");
    expect(screen.getByTestId("camp-tent-done")).toBeTruthy();
    expect(screen.queryByTestId("camp-buy-tent")).toBeNull();
    expect(screen.queryByTestId("camp-buy-slot")).toBeNull();
  });

  it("forges from a built forge, says what a forged policy is, and says when the forge is full", async () => {
    const { onForge } = renderPanel({ camp: camp({ forge: 1, forgedPolicies: 1 }), forgedThisWeek: 0 });
    const policy = screen.getByTestId("camp-policy");
    expect(policy.textContent).toContain("2 map fragments make one free insurance policy");
    expect(policy.textContent).toContain("a card that would be lost comes home wounded");
    expect(screen.getByTestId("camp-policy-held").textContent).toContain("You hold 1 of 2 forged policies.");
    fireEvent.click(screen.getByRole("button", { name: "Forge a policy — 2 map fragments" }));
    expect(onForge).toHaveBeenCalledWith(1);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("keeps the forge button with its reason when the forge is full, and says when this week's is used", () => {
    const { container } = renderPanel({ camp: camp({ forge: 1, forgedPolicies: FORGE_HOLD }), forgedThisWeek: 1 });
    expect((screen.getByTestId("camp-buy-policy") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("camp-buy-policy-reason").textContent).toContain("the most a forge holds");
    expect(screen.getByTestId("camp-policy-held").textContent).toContain("This week's forged launch is used");
    expect(disabledWithoutReason(container)).toEqual([]);
  });

  it("hides the forge's product until the forge is built", () => {
    renderPanel();
    expect(screen.queryByTestId("camp-policy")).toBeNull();
  });

  const relics = [{ id: 7, name: "Kai", campaign: "The Broken Map" }];
  const marks: Accolade[] = [{ kind: "pathfinder", discordId: "42", username: "Ann", value: 42, awardedAt: "2026-09-01T00:00:00.000Z" }];

  it("counts what is waiting for a wall before it is built", () => {
    renderPanel({ relics, accolades: marks });
    expect(screen.getByTestId("camp-wall-waiting").textContent).toBe("Waiting to go up: 1 campaign relic, 1 season mark.");
    expect(screen.queryByTestId("camp-wall-contents")).toBeNull();
  });

  it("hangs relics and marks on a built wall, and leaves out what the atlas has not brought yet", () => {
    renderPanel({ camp: camp({ wall: 1 }), relics, accolades: marks });
    const wall = screen.getByTestId("camp-wall-contents");
    expect(within(wall).getByTestId("camp-wall-relics").textContent).toContain("Kai · The Broken Map");
    expect(within(wall).getByTestId("camp-wall-marks").textContent).toContain("Pathfinder");
    expect(within(wall).queryByText("Landmarks you named")).toBeNull();
    expect(screen.queryByTestId("camp-wall-plaque")).toBeNull();
  });

  it("says what fills an empty wall row, and puts the plaque up at level 2", () => {
    renderPanel({ camp: camp({ wall: 2 }), landmarks: [], roads: [{ tier: "legend" }] });
    expect(screen.getByTestId("camp-wall-relics-empty").textContent).toContain("Finish a campaign");
    expect(screen.getByTestId("camp-wall-landmarks-empty").textContent).toContain("The first squad to reach a landmark names it.");
    expect(screen.getByTestId("camp-wall-roads").textContent).toContain("Legend Hunt");
    expect(screen.getByTestId("camp-wall-plaque")).toBeTruthy();
  });
});

describe("ForgedPolicyToggle", () => {
  const held = camp({ forge: 1, forgedPolicies: 1 });

  it("offers nothing without a camp, without a policy, or on a route that cannot hurt a card", () => {
    const onChange = vi.fn();
    for (const [state, tier] of [
      [null, "raid"],
      [camp({ forge: 1 }), "raid"],
      [held, "scout"],
      [held, "exorcism"],
    ] as const) {
      const { container, unmount } = render(<ForgedPolicyToggle camp={state} forgedThisWeek={0} tier={tier} checked={false} onChange={onChange} />);
      expect(container.innerHTML).toBe("");
      unmount();
    }
  });

  it("offers a held policy on a risky route, in plain words, as a 44px target", () => {
    const onChange = vi.fn();
    render(<ForgedPolicyToggle camp={held} forgedThisWeek={0} tier="legend" checked={false} onChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: /Use a forged policy/ });
    expect(screen.getByTestId("forged-policy").textContent).toContain("free insurance from your forge");
    expect(screen.getByTestId("forged-policy").textContent).toContain("1 forged policy held");
    expect(box.closest("label")?.className).toContain("min-h-11");
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("is disabled with its reason once this week's forged launch is used", () => {
    render(<ForgedPolicyToggle camp={held} forgedThisWeek={1} tier="raid" checked onChange={vi.fn()} />);
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(box.checked).toBe(false);
    expect(screen.getByTestId("forged-policy-reason").textContent).toContain("Monday");
  });
});

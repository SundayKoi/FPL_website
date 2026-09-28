import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CampPanel, { ForgedPolicyToggle } from "./CampPanel";
import { EMPTY_CAMP, type CampState } from "@/lib/expeditions/camp";

const camp = (over: Partial<CampState> = {}): CampState => ({ ...EMPTY_CAMP, ...over });

describe("CampPanel actions", () => {
  it("submits the displayed upgrade level and shows an authoritative refusal", async () => {
    const onUpgrade = vi.fn(async () => "The price changed while you were looking. Refresh your camp and try again.");
    render(
      <CampPanel camp={camp({ tent: 1 })} fragments={5} balance={10_000} onUpgrade={onUpgrade} onForge={vi.fn(async () => null)} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Build a bigger tent — $1,200 + 1 map fragment" }));
    expect(onUpgrade).toHaveBeenCalledWith("tent", 2);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("The price changed"));
  });

  it("offers a held policy only on a risky route and disables it after this week's use", () => {
    const held = camp({ forge: 1, forgedPolicies: 1 });
    const onChange = vi.fn();
    const { rerender } = render(
      <ForgedPolicyToggle camp={held} forgedThisWeek={0} tier="legend" checked={false} onChange={onChange} />,
    );
    const box = screen.getByRole("checkbox", { name: /Use a forged policy/ });
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);

    rerender(<ForgedPolicyToggle camp={held} forgedThisWeek={1} tier="raid" checked onChange={onChange} />);
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
  });
});

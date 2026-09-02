import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ThisWeekStrip from "./ThisWeekStrip";
import type { WeekNotice } from "@/lib/packs/weekNotices";

const live: WeekNotice = { key: "live", title: "Live drops", text: "Match night rip", detail: "until 9 PM", tone: "live" };
const chase: WeekNotice = { key: "chase", title: "This week's chase", text: "Doug — Cracked Ice", detail: "Taken by Spies", tone: "gold" };

afterEach(cleanup);

describe("ThisWeekStrip", () => {
  it("draws nothing in a quiet week", () => {
    const { container } = render(<ThisWeekStrip notices={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("gives the lead the full line and folds the rest into chips", () => {
    render(<ThisWeekStrip notices={[live, chase]} />);
    const strip = within(screen.getByRole("region", { name: "This week" }));
    expect(strip.getByText("Match night rip")).toBeTruthy();
    expect(strip.getByText("until 9 PM")).toBeTruthy();
    // The chase is a chip: its detail rides the title attribute, not the row.
    const chip = strip.getByText("Doug — Cracked Ice").closest("li")!;
    expect(chip.getAttribute("title")).toBe("Taken by Spies");
    expect(strip.queryByText("Taken by Spies")).toBeNull();
  });
});

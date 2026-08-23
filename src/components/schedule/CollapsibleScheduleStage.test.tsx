import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import CollapsibleScheduleStage from "./CollapsibleScheduleStage";

afterEach(() => cleanup());

describe("CollapsibleScheduleStage", () => {
  it("renders its content when the stage is initially open", () => {
    render(
      <CollapsibleScheduleStage
        stageId="week_2"
        label="Week 2"
        note="Intra-division Bo3"
        initiallyOpen
      >
        <p>Week 2 matchup</p>
      </CollapsibleScheduleStage>,
    );

    expect(screen.getByRole("button", { name: /Week 2/ }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Week 2 matchup")).toBeTruthy();
  });

  it("toggles its content from the stage header", () => {
    render(
      <CollapsibleScheduleStage
        stageId="week_2"
        label="Week 2"
        note="Intra-division Bo3"
        initiallyOpen={false}
      >
        <p>Week 2 matchup</p>
      </CollapsibleScheduleStage>,
    );

    const toggle = screen.getByRole("button", { name: /Week 2/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Week 2 matchup")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Week 2 matchup")).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Week 2 matchup")).toBeNull();
  });
});

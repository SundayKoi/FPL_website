import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useState } from "react";
import ScheduleManagementDrawer, { type ScheduleManagementPanels } from "./ScheduleManagementDrawer";
import { useScheduleManagement } from "./ScheduleManagementContext";

Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
  configurable: true,
  value(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  },
});
Object.defineProperty(HTMLDialogElement.prototype, "close", {
  configurable: true,
  value(this: HTMLDialogElement) {
    this.removeAttribute("open");
  },
});

const panels: ScheduleManagementPanels = {
  fixtures: [{
    id: "editor",
    label: "Browse / edit fixtures",
    content: <>
      <label htmlFor="fixture-note">Fixture note</label>
      <input id="fixture-note" defaultValue="draft" />
      <SelectedFixture />
    </>,
  }],
  season: [],
  rewards: [],
};

function SelectedFixture() {
  const management = useScheduleManagement();
  return <span data-testid="selected-fixture">{management?.selectedFixtureId ?? "none"}</span>;
}

function PageControls() {
  const management = useScheduleManagement();
  if (!management) return null;
  return <button type="button" onClick={() => management.requestNavigation({
    section: "fixtures",
    panelId: "editor",
    fixtureId: "fixture-1",
  })}>Edit fixture</button>;
}

function Harness() {
  const [scope, setScope] = useState("premier:S5");
  return (
    <ScheduleManagementDrawer
      panels={panels}
      scope={scope}
      scopeLabel={scope}
    >
      <PageControls />
      <button type="button" onClick={() => setScope("premier:S6")}>Next season</button>
      <button type="button" onClick={() => setScope("premier:S5")}>Previous season</button>
    </ScheduleManagementDrawer>
  );
}

describe("ScheduleManagementDrawer", () => {
  it("resets a clean drawer selection on a season change and does not reopen it when returning", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Edit fixture" }));
    await waitFor(() => expect(document.querySelector("dialog")?.hasAttribute("open")).toBe(true));
    expect(screen.getByTestId("selected-fixture").textContent).toBe("fixture-1");

    fireEvent.click(screen.getByRole("button", { name: "Next season" }));
    await waitFor(() => expect(document.querySelector("dialog")?.hasAttribute("open")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Previous season" }));

    expect(document.querySelector("dialog")?.hasAttribute("open")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Edit fixture" }));
    expect(screen.getByTestId("selected-fixture").textContent).toBe("fixture-1");
  });

  it("keeps dirty edits until the user discards them during a route scope change", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Edit fixture" }));
    fireEvent.change(screen.getByLabelText("Fixture note"), { target: { value: "unsaved edit" } });
    fireEvent.click(screen.getByRole("button", { name: "Next season" }));

    expect(screen.getByRole("alertdialog").textContent).toContain("Discard unsaved changes?");
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect((screen.getByLabelText("Fixture note") as HTMLInputElement).value).toBe("unsaved edit");

    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(document.querySelector("dialog")?.hasAttribute("open")).toBe(false));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

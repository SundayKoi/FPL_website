import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SeasonEndLeagueSelect from "./SeasonEndLeagueSelect";

describe("SeasonEndLeagueSelect", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits the league-only URL when the dropdown changes", () => {
    const requestSubmit = vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(() => undefined);
    render(<SeasonEndLeagueSelect league="premier" />);

    const select = screen.getByRole("combobox", { name: "League" });
    expect((select as HTMLSelectElement).value).toBe("premier");
    expect(select.closest("form")?.getAttribute("action")).toBe("/admin/seasons-end");
    expect(select.closest("form")?.getAttribute("method")).toBe("get");

    fireEvent.change(select, { target: { value: "academy" } });
    expect(requestSubmit).toHaveBeenCalledOnce();
  });
});

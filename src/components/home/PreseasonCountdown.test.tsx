import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PreseasonCountdown from "./PreseasonCountdown";

describe("PreseasonCountdown", () => {
  it("labels the draft event and target date", () => {
    render(<PreseasonCountdown targetAt="2026-08-15T20:00:00-04:00" />);

    expect(screen.getByText("Draft day")).not.toBeNull();
    expect(screen.getByText(/August 15/)).not.toBeNull();
  });
});

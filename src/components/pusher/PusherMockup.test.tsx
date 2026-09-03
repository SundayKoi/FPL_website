import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PusherMockup from "./PusherMockup";

afterEach(cleanup);

describe("the pusher toy", () => {
  it("renders the shelf and its controls, and counts a drop", () => {
    // jsdom has no canvas context, so the loop stays off; the tally still moves.
    render(<PusherMockup />);
    expect(screen.getByRole("img", { name: /pusher shelf/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Drop centre" }));
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("$5")).toBeTruthy();
  });
});

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import NominationAlert from "./NominationAlert";

afterEach(() => {
  cleanup();
});

describe("NominationAlert", () => {
  it("announces the turn with the round's minimum bid", () => {
    render(<NominationAlert isMyNomination round={2} minimumBid={5} />);

    expect(screen.getByRole("dialog", { name: /your nomination/i })).toBeTruthy();
    expect(screen.getByText(/round 2/i)).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
  });

  it("renders nothing when it is not your nomination", () => {
    render(<NominationAlert isMyNomination={false} round={1} minimumBid={10} />);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("dismisses on click and fires again when the turn comes back around", () => {
    const { rerender } = render(<NominationAlert isMyNomination round={1} minimumBid={10} />);

    fireEvent.click(screen.getByRole("button", { name: /pick my player/i }));
    expect(screen.queryByRole("dialog")).toBeNull();

    // turn moves away (someone's lot runs), then returns
    rerender(<NominationAlert isMyNomination={false} round={1} minimumBid={10} />);
    rerender(<NominationAlert isMyNomination round={1} minimumBid={10} />);

    expect(screen.getByRole("dialog", { name: /your nomination/i })).toBeTruthy();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BangerMeter from "./BangerMeter";

describe("BangerMeter", () => {
  it("exposes the score and classification through an accessible meter", () => {
    render(<BangerMeter score={69} voteCount={10} />);

    expect(screen.getByRole("meter", { name: "69% Mid" })).toBeTruthy();
    expect(screen.getByText("69%", { selector: "span" })).toBeTruthy();
  });

  it("keeps a zero-vote score empty instead of calling it a stinker", () => {
    render(<BangerMeter score={0} voteCount={0} />);

    expect(screen.getByRole("meter", { name: "No votes yet" })).toBeTruthy();
    expect(screen.getByText("—", { selector: "span" })).toBeTruthy();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CHAMPIONS_SET, championToCard } from "@/lib/cards/champions";
import ChampionsCard from "./ChampionsCard";

const INK = "data:image/png;base64,champion-ink";

describe("ChampionsCard autograph", () => {
  it("uses the real autograph when one is present", () => {
    const card = { ...championToCard(CHAMPIONS_SET[0], "S5"), autograph: INK };

    render(<ChampionsCard card={card} signed />);

    expect(screen.getByTestId("champ-autograph").getAttribute("src")).toBe(INK);
    expect(screen.queryByLabelText("Autographed")).toBeNull();
  });

  it("keeps the owner-preview text fallback only when real ink is absent", () => {
    const card = championToCard(CHAMPIONS_SET[0], "S5");

    render(<ChampionsCard card={card} signed />);

    expect(screen.getByLabelText("Autographed")).toBeTruthy();
    expect(screen.queryByTestId("champ-autograph")).toBeNull();
  });
});

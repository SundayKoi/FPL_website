import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TeamPrint } from "@/lib/cards/teamCards";
import TeamCard from "./TeamCard";

const INK = "data:image/png;base64,team-ink";

const team: TeamPrint = {
  teamName: "The Faceless",
  imageUrl: null,
  monogram: "FLS",
  abbr: "FLS",
  bannerColor: "#18b6c9",
  overall: 84,
  tierKey: "gold",
  tierLabel: "Gold",
  slots: [
    { role: "Top", name: "Alice", slug: "alice", overall: 84, champion: "Ornn", standout: false, autograph: INK },
    { role: "Jungle", name: "Bo", slug: "bo", overall: 83, champion: "Lee Sin", standout: false, autograph: null },
    { role: "Mid", name: "Ciivil", slug: "ciivil", overall: 85, champion: "Ahri", standout: false, autograph: null },
    { role: "Bot", name: "Dee", slug: "dee", overall: 82, champion: "Jhin", standout: false, autograph: null },
    { role: "Support", name: "Eve", slug: "eve", overall: 86, champion: "Thresh", standout: false, autograph: null },
  ],
  weekStart: "2026-08-24",
};

describe("TeamCard autograph", () => {
  it("uses the shared neutral mark without screen blending or opacity reduction", () => {
    render(<TeamCard team={team} />);

    const ink = screen.getByTestId("team-autograph");
    expect(ink.getAttribute("src")).toBe(INK);
    expect(ink.className).not.toContain("mix-blend-screen");
    expect(ink.getAttribute("style") ?? "").not.toContain("opacity");
  });

  it("does not render a mark for unsigned roster slots", () => {
    render(<TeamCard team={{ ...team, slots: team.slots.map((slot) => ({ ...slot, autograph: null })) }} />);

    expect(screen.queryByTestId("team-autograph")).toBeNull();
  });
});

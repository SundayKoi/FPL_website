import { describe, expect, it } from "vitest";
import { createDraftMatchupView } from "./presentation";
import type { MatchDraftAction } from "./types";

const action = (stepIndex: number, side: "blue" | "red", kind: "pick" | "ban", slot: number, champion: string | null, skipped = false): MatchDraftAction => ({
  stepIndex,
  side,
  kind,
  slot,
  champion,
  skipped,
});

describe("createDraftMatchupView", () => {
  it("normalizes incomplete games while keeping five visible slots per side", () => {
    const view = createDraftMatchupView({
      gameNumber: 2,
      blueTeam: { name: "Blue Team", abbreviation: "BLU" },
      redTeam: { name: "Red Team", abbreviation: "RED" },
      actions: [
        action(0, "blue", "ban", 1, "Aatrox"),
        action(7, "red", "pick", 1, null, true),
      ],
    });

    expect(view.blue.picks).toHaveLength(5);
    expect(view.red.picks).toHaveLength(5);
    expect(view.blue.bans).toHaveLength(5);
    expect(view.red.bans).toHaveLength(5);
    expect(view.blue.picks[0].state).toBe("missing");
    expect(view.red.picks.at(-1)?.state).toBe("skipped");
    expect(view.red.picks.map((pick) => pick.slot)).toEqual([5, 4, 3, 2, 1]);
    expect(view.blue.bans[0].state).toBe("recorded");
    expect(view.red.bans.map((ban) => ban.slot)).toEqual([5, 4, 3, 2, 1]);
  });

  it("keeps pick numbers attached when confirmed roles reorder champions", () => {
    const view = createDraftMatchupView({
      gameNumber: 1,
      blueTeam: { name: "Blue Team", players: ["Top", "Jungle", "Mid", "ADC", "Support"] },
      redTeam: { name: "Red Team" },
      actions: [
        action(6, "blue", "pick", 1, "Ahri"),
        action(9, "blue", "pick", 2, "Lulu"),
        action(10, "blue", "pick", 3, "Sett"),
      ],
      positions: { blue: ["Sett", null, "Ahri", null, "Lulu"] },
      winnerTeam: "Blue Team",
    });

    expect(view.blue.picks.map((pick) => [pick.champion, pick.pickNumber, pick.role])).toEqual([
      ["Sett", 3, "Top"],
      [null, null, "Jungle"],
      ["Ahri", 1, "Mid"],
      [null, null, "ADC"],
      ["Lulu", 2, "Support"],
    ]);
    expect(view.outcome).toEqual({ winnerTeam: "Blue Team", winnerSide: "blue", status: "winner" });
  });
});

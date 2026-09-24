import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LeagueGoalPanel, { LeagueGoalLine } from "./LeagueGoalPanel";
import type { LeagueBoard, LeagueGoal, LeagueWeek } from "@/lib/expeditions/league";

const ridge: LeagueGoal = {
  season: "S5",
  weekStart: "2026-09-21",
  kind: "landmark",
  title: "The Lions–Tigers Ridge",
  target: 40,
  unit: "miles",
  blurb: "A landmark 40 miles out. The league walks there together.",
};

const colossus: LeagueGoal = {
  season: "S5",
  weekStart: "2026-09-14",
  kind: "boss",
  title: "The Tigers Colossus",
  target: 24,
  unit: "pushes",
  blurb: "A boss with 24 health.",
};

const walking: LeagueWeek = {
  goal: ridge,
  progress: { total: 31, target: 40, remaining: 9, fraction: 31 / 40, collectors: 12, reached: false },
  leaders: [
    { discordId: "dee", username: "Dee", stat: 9 },
    { discordId: "ann", username: "Ann", stat: 6 },
    { discordId: "bo", username: "Bo", stat: 6 },
  ],
  me: { stat: 6, rank: 2, of: 12 },
  fell: null,
};

const board = (over: Partial<LeagueBoard> = {}): LeagueBoard => ({ season: "S5", thisWeek: walking, lastWeek: null, ...over });

describe("LeagueGoalPanel", () => {
  it("renders nothing when the league goal is hidden", () => {
    const { container } = render(<LeagueGoalPanel league={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("puts every number in context: how far, by how many, and the viewer's part", () => {
    render(<LeagueGoalPanel league={board()} />);
    expect(screen.getByTestId("league-goal-title").textContent).toBe("The Lions–Tigers Ridge");
    expect(screen.getByTestId("league-goal-progress").textContent).toBe("31 of 40 miles walked by 12 collectors this week");
    expect(screen.getByTestId("league-goal-remaining").textContent).toContain("9 miles to go.");
    expect(screen.getByTestId("league-goal-mine").textContent).toBe("You: 6 miles walked — 2nd of 12 collectors.");
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("31");
    expect(bar.getAttribute("aria-valuemax")).toBe("40");
    expect(screen.getByTestId("league-goal-leaders").textContent).toContain("Dee");
    expect(screen.getByTestId("league-leader-ann").textContent).toContain("(you)");
    expect(screen.getByTestId("league-leader-ann").textContent).toContain("6 miles");
    // Plain words, with the reward's meaning beside it.
    expect(screen.getByTestId("league-goal").textContent).toContain("3 open the Legendary route");
  });

  it("invites a collector who has not walked yet", () => {
    render(<LeagueGoalPanel league={board({ thisWeek: { ...walking, me: { stat: 0, rank: null, of: 12 } } })} />);
    expect(screen.getByTestId("league-goal-mine").textContent).toContain("Any run you launch this week counts once the squad is home.");
  });

  it("says who is out in front and that nobody has walked, when nobody has", () => {
    render(
      <LeagueGoalPanel
        league={board({
          thisWeek: { ...walking, leaders: [], me: null, progress: { total: 0, target: 40, remaining: 40, fraction: 0, collectors: 0, reached: false } },
        })}
      />,
    );
    expect(screen.getByTestId("league-goal-progress").textContent).toBe("0 of 40 miles walked by 0 collectors this week");
    expect(screen.getByTestId("league-goal-empty")).toBeTruthy();
    expect(screen.queryByTestId("league-goal-mine")).toBeNull();
  });

  it("a boss that fell: when, what everyone got, the Vanguard, and whether the viewer was paid", () => {
    const fell: LeagueWeek = {
      goal: { ...colossus, weekStart: "2026-09-21" },
      progress: { total: 24, target: 24, remaining: 0, fraction: 1, collectors: 7, reached: true },
      leaders: [{ discordId: "bo", username: "Bo", stat: 10 }],
      me: { stat: 3, rank: 4, of: 7 },
      // Thursday 24 September, 2 PM Eastern.
      fell: { at: "2026-09-24T18:00:00Z", vanguard: { discordId: "bo", username: "Bo" }, rewarded: 7, mine: true },
    };
    render(<LeagueGoalPanel league={board({ thisWeek: fell })} />);
    expect(screen.getByTestId("league-goal-progress").textContent).toBe("24 of 24 pushes landed by 7 collectors this week");
    expect(screen.getByTestId("league-goal-fell").textContent).toContain(
      "Brought down Thursday — one map fragment to each of the 7 who helped. Yours is already counted with your map fragments.",
    );
    expect(screen.getByTestId("league-goal-fell").textContent).toContain("Vanguard: Bo");
    expect(screen.getByTestId("league-leader-bo").textContent).toContain("Vanguard");
    expect(screen.queryByTestId("league-goal-remaining")).toBeNull();
  });

  it("carries last week's Vanguard as a chip once it fell, and last week's open goal as a card while it has not", () => {
    const lastFell: LeagueWeek = {
      goal: colossus,
      progress: { total: 26, target: 24, remaining: 0, fraction: 1, collectors: 5, reached: true },
      leaders: [],
      me: null,
      fell: { at: "2026-09-18T01:00:00Z", vanguard: { discordId: "ann", username: "Ann" }, rewarded: 5, mine: false },
    };
    const { rerender } = render(<LeagueGoalPanel league={board({ lastWeek: lastFell })} />);
    // 01:00 UTC on the 18th is still Thursday evening in New York.
    expect(screen.getByTestId("league-last-fell").textContent).toContain("The Tigers Colossus — brought down Thursday.");
    expect(screen.getByTestId("league-vanguard").textContent).toBe("Vanguard Ann");
    expect(screen.queryByTestId("league-last-week")).toBeNull();

    const lastOpen: LeagueWeek = {
      ...lastFell,
      progress: { total: 20, target: 24, remaining: 4, fraction: 20 / 24, collectors: 5, reached: false },
      me: { stat: 0, rank: null, of: 5 },
      fell: null,
    };
    rerender(<LeagueGoalPanel league={board({ lastWeek: lastOpen })} />);
    expect(screen.queryByTestId("league-last-fell")).toBeNull();
    const card = screen.getByTestId("league-last-week");
    expect(card.textContent).toContain("20 of 24 pushes landed by 5 collectors last week");
    expect(card.textContent).toContain("Runs that left last week still count once they're home");
    expect(card.textContent).toContain("only runs that left last week count toward it");
  });
});

describe("LeagueGoalLine", () => {
  it("renders nothing when the league goal is hidden", () => {
    const { container } = render(<LeagueGoalLine league={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("is one line with the progress and who is walking", () => {
    render(<LeagueGoalLine league={board()} />);
    expect(screen.getByTestId("league-line").textContent).toBe("League goal 31 of 40 miles walked toward The Lions–Tigers Ridge by 12 collectors");
  });

  it("says when it fell and what the viewer got", () => {
    const fell: LeagueWeek = {
      ...walking,
      goal: { ...colossus, weekStart: "2026-09-21" },
      fell: { at: "2026-09-24T18:00:00Z", vanguard: null, rewarded: 7, mine: true },
    };
    render(<LeagueGoalLine league={board({ thisWeek: fell })} />);
    expect(screen.getByTestId("league-line").textContent).toBe("League goal The Tigers Colossus brought down Thursday — +1 map fragment for you");
  });

  it("opens the League tab when the board gives it somewhere to go", () => {
    const onOpen = vi.fn();
    render(<LeagueGoalLine league={board()} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: /League goal/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

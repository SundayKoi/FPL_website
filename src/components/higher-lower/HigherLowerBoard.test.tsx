import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HigherLowerBoard from "./HigherLowerBoard";
import type { HigherLowerGame } from "@/lib/higher-lower/types";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/components/cards/PlayerCard3D", () => ({
  default: ({ card }: { card: { name: string; overall: number } }) => <div>{card.name} {card.overall} OVR</div>,
}));

const game = {
  date: "2026-08-29",
  weekStart: "2026-08-24",
  league: "premier",
  state: "awaiting_choice",
  score: 0,
  round: 1,
  totalRounds: 30,
  runVersion: 1,
  canReplay: false,
  roundExpiresAt: "2099-08-29T12:00:20.000Z",
  referenceCard: { name: "Reference", overall: 82 },
  challengerCard: null,
  challenger: {
    slug: "challenger",
    name: "Challenger",
    artUrl: null,
    teamName: "Red Team",
    teamAbbr: "RED",
    teamImageUrl: null,
  },
  lastChoice: null,
  lastCorrect: null,
  completionReason: null,
  weeklyLeaderboard: [],
} as unknown as HigherLowerGame;

afterEach(() => cleanup());

describe("HigherLowerBoard", () => {
  it("does not put the concealed challenger OVR in the DOM or accessible label", () => {
    render(
      <HigherLowerBoard
        initialGame={game}
        league="premier"
        startRun={vi.fn()}
        submitChoice={vi.fn()}
        advanceRound={vi.fn()}
      />,
    );

    expect(screen.getByText("OVR concealed")).toBeTruthy();
    expect(screen.getByLabelText("Challenger challenger card")).toBeTruthy();
    expect(screen.queryByText("91 OVR")).toBeNull();
    expect(screen.queryByLabelText(/91/)).toBeNull();
    expect(screen.getByRole("button", { name: /Higher/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Lower/ })).toBeTruthy();
  });

  it("shows owners a replay action after a finished run", () => {
    render(
      <HigherLowerBoard
        initialGame={{ ...game, state: "lost", canReplay: true } as HigherLowerGame}
        league="premier"
        startRun={vi.fn()}
        submitChoice={vi.fn()}
        advanceRound={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Play Again/ })).toBeTruthy();
    expect(screen.getByText("Owner preview: replay as much as you want.")).toBeTruthy();
    expect(screen.queryByText("This Daily run cannot be restarted or replayed.")).toBeNull();
  });
});

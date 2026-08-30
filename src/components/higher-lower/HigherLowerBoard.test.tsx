import { cleanup, render, screen, within } from "@testing-library/react";
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
  referenceCard: { name: "Reference", overall: 82, editionWeek: "2026-08-24" },
  challengerCard: null,
  challenger: {
    slug: "challenger",
    name: "Challenger",
    editionWeek: "2026-08-17",
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

const correctRevealGame = {
  ...game,
  state: "correct_reveal",
  challenger: null,
  challengerCard: { name: "Challenger", overall: 91, editionWeek: "2026-08-17" },
  lastCorrect: true,
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
    expect(screen.getByText("From card week · Aug 24, 2026")).toBeTruthy();
    expect(screen.getByText("From card week · Aug 17, 2026")).toBeTruthy();
    expect(screen.getByLabelText("Challenger challenger card")).toBeTruthy();
    expect(screen.queryByText("Reference card")).toBeNull();
    expect(screen.queryByText("91 OVR")).toBeNull();
    expect(screen.queryByLabelText(/91/)).toBeNull();
    const choice = screen.getByLabelText("Higher or Lower choice");
    const timer = within(choice).getByRole("timer");
    expect(timer.compareDocumentPosition(within(choice).getByText("vs"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByRole("button", { name: "Higher" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lower" })).toBeTruthy();
    expect(screen.getByText("↑")).toBeTruthy();
    expect(screen.getByText("↓")).toBeTruthy();
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
    expect(screen.getByRole("link", { name: /Back to Premium HQ/ })).toBeTruthy();
    expect(screen.queryByText("Owner preview: replay as much as you want.")).toBeNull();
    expect(screen.queryByText("Wrong answer. Run over.")).toBeNull();
  });

  it("puts Next Card in the game controls after a correct reveal", () => {
    render(
      <HigherLowerBoard
        initialGame={correctRevealGame}
        league="premier"
        startRun={vi.fn()}
        submitChoice={vi.fn()}
        advanceRound={vi.fn()}
      />,
    );

    const result = screen.getByLabelText("Round result");
    expect(within(result).getByRole("button", { name: "Next Card →" })).toBeTruthy();
    expect(screen.queryByText("Correct. Challenger becomes your next reference card.")).toBeNull();
  });
});

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import MyRoster from "./MyRoster";

afterEach(cleanup);

describe("MyRoster", () => {
  it("renders the team OP.GG multi-search link when supplied", () => {
    render(
      <MyRoster
        draftPlayers={[]}
        riotAccounts={[]}
        multiOpggUrl="https://op.gg/lol/multisearch/na?summoners=Player%23NA1"
      />,
    );

    const link = screen.getByRole("link", { name: "My Team OP.GG Multi" });
    expect(link.getAttribute("href")).toBe("https://op.gg/lol/multisearch/na?summoners=Player%23NA1");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("omits the team OP.GG multi-search link when no URL is supplied", () => {
    render(<MyRoster draftPlayers={[]} riotAccounts={[]} multiOpggUrl={null} />);

    expect(screen.queryByRole("link", { name: "My Team OP.GG Multi" })).toBeNull();
  });

  it("highlights only the signed-in canonical player's roster spot", () => {
    render(
      <MyRoster
        playerPoolId="pool-mine"
        draftPlayers={[
          {
            id: "draft-mine",
            draft_id: "draft-1",
            display_name: "Player Mine",
            role: "mid",
            rank: null,
            opgg_url: null,
            notes: null,
            canonical_player_id: "pool-mine",
            team_id: "team-1",
            price: 10,
            acquisition: "auction",
          },
          {
            id: "draft-other",
            draft_id: "draft-1",
            display_name: "Player Other",
            role: "top",
            rank: null,
            opgg_url: null,
            notes: null,
            canonical_player_id: "pool-other",
            team_id: "team-1",
            price: 8,
            acquisition: "auction",
          },
        ]}
        riotAccounts={[]}
      />,
    );

    expect(screen.getByText("Player Mine").closest("li")?.getAttribute("aria-current")).toBe("true");
    expect(screen.getByText("Player Other").closest("li")?.getAttribute("aria-current")).toBeNull();
    expect(screen.getAllByText("You")).toHaveLength(1);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

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
});

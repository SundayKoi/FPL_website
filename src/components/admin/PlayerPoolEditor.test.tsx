import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Player } from "@/lib/draft/types";

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/players/pointValues", () => ({ currentPlayerPointValue: (name: string) => (name === "Namesake" ? 42 : null) }));

import PlayerPoolEditor from "./PlayerPoolEditor";

afterEach(cleanup);

const player = { id: "p1", draft_id: "d1", display_name: "Namesake", role: "mid", rank: null, opgg_url: null, team_id: null, price: null } as Player;

describe("PlayerPoolEditor", () => {
  it("shows each pool player's league point value", () => {
    render(<PlayerPoolEditor draftId="d1" players={[player]} onChanged={vi.fn()} />);
    expect(screen.getByRole("columnheader", { name: "Points" })).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
  });

  it("leaves league points out of a draft outside the league", () => {
    render(<PlayerPoolEditor draftId="d1" players={[player]} onChanged={vi.fn()} leaguePoints={false} />);
    expect(screen.queryByRole("columnheader", { name: "Points" })).toBeNull();
    expect(screen.queryByText("42")).toBeNull();
    expect(screen.getByText("Namesake")).toBeTruthy();
  });
});

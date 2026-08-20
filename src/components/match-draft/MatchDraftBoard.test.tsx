import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Lobby-mode tests run without onSave, so the board builds a live client;
// give it a chainable realtime channel and a spyable rpc.
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn(async () => ({ error: null })) }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const channel: Record<string, unknown> = {
      track: () => Promise.resolve(),
      presenceState: () => ({}),
      send: () => Promise.resolve(),
    };
    channel.on = () => channel;
    channel.subscribe = () => channel;
    return {
      rpc: rpcMock,
      channel: () => channel,
      removeChannel: () => Promise.resolve(),
    };
  },
}));
import MatchDraftBoard from "./MatchDraftBoard";
import { LCS_DRAFT_STEPS } from "@/lib/match-draft/rules";
import { CHAMPIONS } from "@/lib/match-draft/champions";
import type { MatchDraftState } from "@/lib/match-draft/types";

afterEach(cleanup);

const state: MatchDraftState = {
  fixtureId: "fixture-1",
  gameNumber: 1,
  status: "drafting",
  layout: "stage",
  currentStepIndex: 6,
  turnStartedAt: "2026-08-19T15:00:00Z",
  blueTeam: { name: "Blue Team", abbreviation: "BLU", imageUrl: null, players: ["Blue Top", "Blue Jungle", "Blue Mid", "Blue ADC", "Blue Support"] },
  redTeam: { name: "Red Team", abbreviation: "RED", imageUrl: null, players: ["Red Top", "Red Jungle", "Red Mid", "Red ADC", "Red Support"] },
  scheduledTeams: [
    { name: "Blue Team", abbreviation: "BLU", imageUrl: null, players: ["Blue Top", "Blue Jungle", "Blue Mid", "Blue ADC", "Blue Support"] },
    { name: "Red Team", abbreviation: "RED", imageUrl: null, players: ["Red Top", "Red Jungle", "Red Mid", "Red ADC", "Red Support"] },
  ],
  canChooseSides: false,
  sideChoiceRequired: false,
  blueReady: true,
  redReady: true,
  changeRequest: null,
  positions: null,
  actions: [
    { stepIndex: 0, side: "blue", kind: "ban", slot: 1, champion: "Aatrox", playerName: null },
    { stepIndex: 6, side: "blue", kind: "pick", slot: 1, champion: "Ahri", playerName: "Blue Mid" },
  ],
  blockedChampions: ["Zeri"],
};

describe("MatchDraftBoard", () => {
  it("renders the stage layout with team abbreviations, champion names, player names, and timer", () => {
    const { container } = render(<MatchDraftBoard initialState={state} onSave={vi.fn()} />);

    expect(screen.getAllByText("BLU").length).toBeGreaterThan(0);
    expect(screen.getAllByText("RED").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ahri").length).toBeGreaterThan(0);
    // Pick slots use horizontal centered splash art so it fills the wide slot,
    // cropped toward the top of the image to keep the champion's head in frame.
    expect(container.querySelector('img[src="https://ddragon.leagueoflegends.com/cdn/img/champion/centered/Ahri_0.jpg"]')).toBeTruthy();
    expect(container.querySelector('img[src="https://ddragon.leagueoflegends.com/cdn/16.16.1/img/champion/Ahri.png"]')).toBeTruthy();
    expect(screen.getAllByText("Blue Mid").length).toBeGreaterThan(0);
    // The turn clock is live now — this fixture's turn started long ago, so it reads 0s.
    expect(screen.getByText(/^\d+s$/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /stage layout/i }).getAttribute("aria-pressed")).toBe("true");
  });

  it("uses extra-small champion images by default and resizes with minus and plus controls", () => {
    render(<MatchDraftBoard initialState={state} onSave={vi.fn()} />);

    expect(screen.getByTestId("champion-pool-grid").getAttribute("data-size")).toBe("xs");

    fireEvent.click(screen.getByRole("button", { name: /increase image size/i }));

    expect(screen.getByTestId("champion-pool-grid").getAttribute("data-size")).toBe("sm");

    fireEvent.click(screen.getByRole("button", { name: /decrease image size/i }));

    expect(screen.getByTestId("champion-pool-grid").getAttribute("data-size")).toBe("xs");
  });

  it("auto-fills a pick with that side's individual player name", () => {
    const onSave = vi.fn();
    render(<MatchDraftBoard initialState={{ ...state, actions: [] }} onSave={onSave} />);

    // Two-step drafting: select, then Lock In.
    fireEvent.click(screen.getByRole("button", { name: "Amumu" }));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /lock in Amumu/i }));

    const saved = onSave.mock.calls.at(-1)?.[0] as MatchDraftState;
    expect(saved.actions.find((action) => action.stepIndex === 6)?.playerName).toBe("Blue Top");
  });

  it("lets game two choose sides before the draft is locked", () => {
    const onSave = vi.fn();
    render(<MatchDraftBoard initialState={{ ...state, gameNumber: 2, canChooseSides: true, sideChoiceRequired: true, actions: [] }} onSave={onSave} />);

    expect(screen.getByRole("button", { name: "Aatrox" }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /red team blue side/i }));

    const saved = onSave.mock.calls[0][0] as MatchDraftState;
    expect(saved.blueTeam.abbreviation).toBe("RED");
    expect(saved.blueTeam.players[0]).toBe("Red Top");
    expect(saved.redTeam.abbreviation).toBe("BLU");
    expect(saved.sideChoiceRequired).toBe(false);
  });

  it("switches to the board layout", () => {
    render(<MatchDraftBoard initialState={state} onSave={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /board layout/i }));

    expect(screen.getByRole("button", { name: /board layout/i }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("region", { name: "Champion pool" })).toBeTruthy();
  });

  it("does not allow fearless-blocked champions to be selected", () => {
    render(<MatchDraftBoard initialState={{ ...state, actions: [] }} onSave={vi.fn()} />);

    const zeri = screen.getByRole("button", { name: /Zeri unavailable/i });
    expect(zeri.hasAttribute("disabled")).toBe(true);
  });

  it("shows the banned champion's image and name in the ban tile", () => {
    render(<MatchDraftBoard initialState={state} onSave={vi.fn()} />);

    const banTile = screen.getAllByTestId("ban-blue-1")[0];
    const icon = banTile.querySelector('img[src="https://ddragon.leagueoflegends.com/cdn/16.16.1/img/champion/Aatrox.png"]');
    expect(icon).toBeTruthy();
    expect(banTile.textContent).toContain("Aatrox");
    // An empty slot still shows its placeholder.
    expect(screen.getAllByTestId("ban-red-1")[0].textContent).toContain("B1");
  });

  it("switches games instantly from the tabs, without a navigation", () => {
    const gameTwo: MatchDraftState = {
      ...state,
      gameNumber: 2,
      status: "complete",
      actions: [{ stepIndex: 0, side: "blue", kind: "ban", slot: 1, champion: "Zed", playerName: null }],
    };
    render(
      <MatchDraftBoard
        initialState={state}
        initialStates={[state, gameTwo]}
        onSave={vi.fn()}
        games={[
          { gameNumber: 1, href: "/match-draft/fixture-1?game=1", status: "drafting" },
          { gameNumber: 2, href: "/match-draft/fixture-1?game=2", status: "complete" },
        ]}
      />,
    );

    const tabs = screen.getByRole("navigation", { name: /series games/i });
    expect(tabs.querySelectorAll("button")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /game 1/i }).getAttribute("aria-current")).toBe("page");
    // The finished game is clickable and renders instantly (banner + ✓).
    expect(screen.getByRole("button", { name: /game 2/i }).textContent).toContain("✓");
    fireEvent.click(screen.getByRole("button", { name: /game 2/i }));
    expect(screen.getByRole("button", { name: /game 2/i }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("region", { name: /draft complete/i })).toBeTruthy();
  });

  it("labels the series with its configured format", () => {
    render(<MatchDraftBoard initialState={state} onSave={vi.fn()} seriesFormat={{ bestOf: 5, fearless: false }} />);
    expect(screen.getByText(/Bo5 · Game 1/i)).toBeTruthy();

    cleanup();
    render(<MatchDraftBoard initialState={state} onSave={vi.fn()} seriesFormat={{ bestOf: 3, fearless: true }} />);
    expect(screen.getByText(/Bo3 fearless · Game 1/i)).toBeTruthy();
    // Format controls persist to the database, so preview mode hides them.
    expect(screen.queryByRole("group", { name: /series format/i })).toBeNull();
  });

  it("filters the champion pool by role", () => {
    render(<MatchDraftBoard initialState={state} onSave={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /^Support$/ }));
    expect(screen.queryByRole("button", { name: /^Aatrox/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^Thresh/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^All$/ }));
    expect(screen.getByRole("button", { name: /^Aatrox/ })).toBeTruthy();
  });

  it("locks picks behind the ready check until both sides are ready", () => {
    const onSave = vi.fn();
    render(
      <MatchDraftBoard
        initialState={{ ...state, actions: [], blueReady: false, redReady: false }}
        onSave={onSave}
      />,
    );

    // Pool is disabled and the clock is parked while waiting.
    expect(screen.getByRole("button", { name: "Ahri" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/waiting for ready check/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /BLU ready\?/i }));
    const afterBlue = onSave.mock.calls[0][0] as MatchDraftState;
    expect(afterBlue.blueReady).toBe(true);
    expect(afterBlue.redReady).toBe(false);
  });

  it("confirms the final pick and marks the draft complete", () => {
    const priorActions = LCS_DRAFT_STEPS.slice(0, 19).map((step, i) => ({
      stepIndex: step.index,
      side: step.side,
      kind: step.kind,
      slot: step.slot,
      champion: CHAMPIONS[i].name,
      playerName: null,
    }));
    const onSave = vi.fn();
    render(
      <MatchDraftBoard
        initialState={{ ...state, currentStepIndex: 19, actions: priorActions }}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Zyra" }));
    fireEvent.click(screen.getByRole("button", { name: /lock in Zyra/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as MatchDraftState;
    expect(saved.actions).toHaveLength(20);
    expect(saved.status).toBe("complete");
  });

  it("locks a completed draft — no more clicks, and the banner shows", () => {
    const onSave = vi.fn();
    render(
      <MatchDraftBoard
        initialState={{ ...state, status: "complete", currentStepIndex: 19 }}
        onSave={onSave}
      />,
    );

    expect(screen.getByRole("region", { name: /draft complete/i })).toBeTruthy();
    const pool = screen.getByRole("button", { name: "Zyra" });
    expect(pool.hasAttribute("disabled")).toBe(true);
    fireEvent.click(pool);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("only lets the side whose turn it is act — the other captain is locked out", () => {
    const onSave = vi.fn();
    // Step 6 is blue pick 1; the viewer captains the RED team.
    render(<MatchDraftBoard initialState={state} onSave={onSave} viewerTeamName="Red Team" />);

    expect(screen.getByText(/drafting for RED \(red side\)/i)).toBeTruthy();
    const zed = screen.getByRole("button", { name: "Zed" });
    expect(zed.hasAttribute("disabled")).toBe(true);
    fireEvent.click(zed);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("locks ready buttons to each captain's own side and spectators out entirely", () => {
    const onSave = vi.fn();
    render(
      <MatchDraftBoard
        initialState={{ ...state, actions: [], blueReady: false, redReady: false }}
        onSave={onSave}
        viewerTeamName="Blue Team"
      />,
    );
    expect(screen.getByRole("button", { name: /BLU ready\?/i }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("button", { name: /RED ready\?/i }).hasAttribute("disabled")).toBe(true);

    cleanup();
    render(
      <MatchDraftBoard
        initialState={{ ...state, actions: [], blueReady: false, redReady: false }}
        onSave={onSave}
        viewerTeamName={null}
      />,
    );
    expect(screen.getByText(/spectating/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /BLU ready\?/i }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /RED ready\?/i }).hasAttribute("disabled")).toBe(true);
  });

  it("lets admins act for any side", () => {
    const onSave = vi.fn();
    render(<MatchDraftBoard initialState={state} onSave={onSave} viewerTeamName={null} canReset />);

    expect(screen.getByText(/admin — full control/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Zed" }).hasAttribute("disabled")).toBe(false);
  });

  it("renders skipped steps and the pending change request banner", () => {
    render(
      <MatchDraftBoard
        initialState={{
          ...state,
          actions: [
            { stepIndex: 0, side: "blue", kind: "ban", slot: 1, champion: null, skipped: true },
            { stepIndex: 1, side: "red", kind: "ban", slot: 1, champion: "Aatrox", playerName: null },
          ],
          currentStepIndex: 2,
          changeRequest: { stepIndex: 1, side: "red", champion: "Aatrox" },
        }}
        onSave={vi.fn()}
        viewerTeamName="Blue Team"
      />,
    );

    expect(screen.getAllByTestId("ban-blue-1")[0].textContent).toContain("Skip");
    const banner = screen.getByRole("region", { name: /change request/i });
    expect(banner.textContent).toContain("RED wants to redo");
    expect(banner.textContent).toContain("Aatrox");
  });

  it("hides the admin reset controls in preview mode and without the admin flag", () => {
    render(<MatchDraftBoard initialState={state} onSave={vi.fn()} canReset />);
    expect(screen.queryByRole("button", { name: /reset game/i })).toBeNull();

    cleanup();
    render(<MatchDraftBoard initialState={state} onSave={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /reset series/i })).toBeNull();
  });

  it("shows no player placeholder when a team has no roster", () => {
    const noRoster = {
      ...state,
      blueTeam: { ...state.blueTeam, players: [] },
      redTeam: { ...state.redTeam, players: [] },
      scheduledTeams: state.scheduledTeams,
    };
    render(<MatchDraftBoard initialState={noRoster} onSave={vi.fn()} />);

    expect(screen.queryByText(/player tbd/i)).toBeNull();
    // A pick locked with a recorded player name still shows it.
    expect(screen.getAllByText("Blue Mid").length).toBeGreaterThan(0);
  });

  it("pops the lock-in bar on selection and cancel dismisses it without saving", () => {
    const onSave = vi.fn();
    render(<MatchDraftBoard initialState={{ ...state, actions: [] }} onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "Amumu" }));
    expect(screen.getByRole("dialog", { name: /confirm pick/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(screen.queryByRole("dialog", { name: /confirm pick/i })).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("auto-follows the latest active game in overlay mode", () => {
    const gameTwo: MatchDraftState = { ...state, gameNumber: 2, actions: [state.actions[0]] };
    render(
      <MatchDraftBoard
        initialState={{ ...state, status: "complete" }}
        initialStates={[{ ...state, status: "complete" }, gameTwo]}
        overlay
        followLive
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText("Game 2")).toBeTruthy();
    // No overlay controls sneak in.
    expect(screen.queryByRole("button", { name: /lock in/i })).toBeNull();
  });

  it("re-orders the pick column by role once positions are confirmed", () => {
    render(
      <MatchDraftBoard
        initialState={{
          ...state,
          status: "complete",
          actions: [
            { stepIndex: 6, side: "blue", kind: "pick", slot: 1, champion: "Ahri", playerName: "Blue Top" },
            { stepIndex: 9, side: "blue", kind: "pick", slot: 2, champion: "Zed", playerName: "Blue Jungle" },
          ],
          positions: { blue: ["Zed", "Ahri", null, null, null] },
        }}
        onSave={vi.fn()}
      />,
    );

    // Role labels replace "pick N" and the order follows the confirmation.
    expect(screen.getAllByText("Top").length).toBeGreaterThan(0);
    const column = screen.getByRole("region", { name: /stage draft layout/i });
    const text = column.textContent ?? "";
    expect(text.indexOf("Zed")).toBeLessThan(text.indexOf("Ahri"));
  });

  it("lets a lobby captain confirm roles through the open_draft RPC", async () => {
    rpcMock.mockClear();
    render(
      <MatchDraftBoard
        initialState={{
          ...state,
          fixtureId: "lobby-1",
          status: "complete",
          actions: [
            { stepIndex: 6, side: "blue", kind: "pick", slot: 1, champion: "Ahri", playerName: null },
            { stepIndex: 9, side: "blue", kind: "pick", slot: 2, champion: "Zed", playerName: null },
          ],
        }}
        viewerTeamName="Blue Team"
        lobby={{ lobbyId: "lobby-1", token: "tok-a" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /confirm roles/i }));
    // Rows reorder by pointer drag; arrow keys drive the same move (and are
    // what jsdom can exercise).
    fireEvent.keyDown(screen.getByLabelText(/reorder Ahri/i), { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("button", { name: /save roles/i }));

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith("set_open_draft_positions", {
        p_token: "tok-a",
        p_game: 1,
        p_side: "blue",
        p_champions: ["Zed", "Ahri", null, null, null],
      });
    });
  });

  it("records a lobby game's winner and shows the series score", async () => {
    rpcMock.mockClear();
    render(
      <MatchDraftBoard
        initialState={{ ...state, fixtureId: "lobby-1", status: "complete" }}
        viewerTeamName="Blue Team"
        lobby={{ lobbyId: "lobby-1", token: "tok-a" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^BLU won$/i }));

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith("set_open_draft_winner", {
        p_token: "tok-a",
        p_game: 1,
        p_team: "Blue Team",
      });
    });
    expect(screen.getByText(/BLU 1–0 RED/)).toBeTruthy();
  });

  it("records a fixture game's winner through the match_draft RPC and links to reporting once the series is called", async () => {
    rpcMock.mockClear();
    render(
      <MatchDraftBoard
        initialState={{ ...state, status: "complete" }}
        viewerTeamName="Blue Team"
        seriesFormat={{ bestOf: 1, fearless: true }}
        reportHref="/captain"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^BLU won$/i }));

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith("set_match_draft_winner", {
        p_fixture: "fixture-1",
        p_game: 1,
        p_team: "Blue Team",
      });
    });
    // Bo1: one recorded win calls the series and surfaces the report link.
    expect(screen.getByText(/BLU takes the series/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /report this result/i }).getAttribute("href")).toBe("/captain");
  });

  it("shows the game's tourney code in the complete banner when the viewer received one", () => {
    render(
      <MatchDraftBoard
        initialState={{ ...state, status: "complete" }}
        viewerTeamName="Blue Team"
        tourneyCodes={{ 1: "NA0451-TOURN-CODE" }}
      />,
    );

    expect(screen.getByText("NA0451-TOURN-CODE")).toBeTruthy();
    expect(screen.getByRole("button", { name: /copy/i })).toBeTruthy();
  });

  it("renders the overlay without a page background when transparent", () => {
    const { container } = render(
      <MatchDraftBoard initialState={state} overlay overlayTransparent onSave={vi.fn()} />,
    );
    const main = container.querySelector("main");
    expect(main?.className).toContain("bg-transparent");
    expect(main?.className).not.toContain("bg-navy");
  });

  it("routes lobby drafting through the token-checked open_draft RPCs", async () => {
    rpcMock.mockClear();
    render(
      <MatchDraftBoard
        initialState={{ ...state, fixtureId: "lobby-1", actions: [], currentStepIndex: 0 }}
        viewerTeamName="Blue Team"
        lobby={{ lobbyId: "lobby-1", token: "tok-a" }}
      />,
    );

    // Public lobbies fix the format at creation and swap the admin undo for
    // captain-accessible resets.
    expect(screen.queryByRole("group", { name: /series format/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /undo last/i })).toBeNull();
    expect(screen.getByRole("button", { name: /reset game/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Aatrox" }));
    fireEvent.click(screen.getByRole("button", { name: /lock in Aatrox/i }));

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith("apply_open_draft_action", {
        p_token: "tok-a",
        p_game: 1,
        p_step: 0,
        p_champion: "Aatrox",
        p_player_name: null,
      });
    });
  });
});

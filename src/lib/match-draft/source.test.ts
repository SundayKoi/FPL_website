import { describe, expect, it } from "vitest";
import { draftSource } from "./source";

describe("draftSource", () => {
  it("keeps a fixture's RPCs, table and links", () => {
    const source = draftSource({ fixtureId: "fx" });
    expect(source.rpc("apply_match_draft_action", { p_game: 2 })).toEqual({ name: "apply_match_draft_action", params: { p_fixture: "fx", p_game: 2 } });
    expect([source.kind, source.table, source.scopeColumn, source.scopeId, source.channel]).toEqual(["fixture", "match_drafts", "fixture_id", "fx", "match-draft-fx"]);
    expect([source.gameHref(3), source.spectatorPath]).toEqual(["/match-draft/fx?game=3", "/match-draft/fx"]);
  });

  it("sends a lobby through its token-checked twins", () => {
    const source = draftSource({ fixtureId: "lobby-id", lobby: { lobbyId: "lobby-id", token: "tok" } });
    expect(source.rpc("reset_match_draft", { p_game: null })).toEqual({ name: "reset_open_draft", params: { p_token: "tok", p_game: null } });
    expect([source.table, source.scopeColumn, source.channel, source.spectatorPath]).toEqual(["open_drafts", "lobby_id", "open-draft-lobby-id", null]);
    expect(source.gameHref(1)).toBe("/drafter/tok?game=1");
  });

  it("sends an offseason match through the offseason twins", () => {
    const source = draftSource({ fixtureId: "m1", offseasonMatchId: "m1" });
    expect(source.rpc("set_match_draft_ready", { p_game: 1 })).toEqual({ name: "set_offseason_draft_ready", params: { p_match: "m1", p_game: 1 } });
    expect(source.rpc("undo_match_draft_last").name).toBe("undo_offseason_draft_last");
    expect([source.table, source.scopeColumn, source.channel]).toEqual(["offseason_match_drafts", "match_id", "offseason-draft-m1"]);
    expect([source.gameHref(2), source.spectatorPath]).toEqual(["/offseason/draft/m1?game=2", "/offseason/draft/m1"]);
  });
});

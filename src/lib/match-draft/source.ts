import type { OpenDraftLobbyHandle } from "./types";

// Where a draft board's games live: a league fixture (match_drafts), a public
// token lobby (open_drafts) or an offseason match (offseason_match_drafts).
// The three keep the same RPCs under different names: the fixture drafter's
// "match_draft" becomes "open_draft" or "offseason_draft", and the fixture id
// becomes the lobby's token or the offseason match id.

export type DraftSourceKind = "fixture" | "lobby" | "offseason";

export interface DraftSource {
  kind: DraftSourceKind;
  /** The fixture, lobby or offseason match the games belong to. */
  scopeId: string;
  table: "match_drafts" | "open_drafts" | "offseason_match_drafts";
  scopeColumn: "fixture_id" | "lobby_id" | "match_id";
  /** The realtime channel every viewer of the series joins. */
  channel: string;
  /** Lobbies hand out their links at creation; the others share one URL. */
  spectatorPath: string | null;
  /** The fixture drafter's RPC name, as this source names it, with its scope argument. */
  rpc: (name: string, params?: Record<string, unknown>) => { name: string; params: Record<string, unknown> };
  gameHref: (gameNumber: number) => string;
}

export function draftSource({
  fixtureId,
  lobby = null,
  offseasonMatchId = null,
}: {
  /** state.fixtureId: the fixture, or the lobby or offseason match standing in for one. */
  fixtureId: string;
  lobby?: OpenDraftLobbyHandle | null;
  offseasonMatchId?: string | null;
}): DraftSource {
  if (lobby) {
    return {
      kind: "lobby",
      scopeId: lobby.lobbyId,
      table: "open_drafts",
      scopeColumn: "lobby_id",
      channel: `open-draft-${lobby.lobbyId}`,
      spectatorPath: null,
      rpc: (name, params = {}) => ({ name: name.replace("match_draft", "open_draft"), params: { p_token: lobby.token, ...params } }),
      gameHref: (gameNumber) => `/drafter/${lobby.token}?game=${gameNumber}`,
    };
  }
  if (offseasonMatchId) {
    return {
      kind: "offseason",
      scopeId: offseasonMatchId,
      table: "offseason_match_drafts",
      scopeColumn: "match_id",
      channel: `offseason-draft-${offseasonMatchId}`,
      spectatorPath: `/offseason/draft/${offseasonMatchId}`,
      rpc: (name, params = {}) => ({ name: name.replace("match_draft", "offseason_draft"), params: { p_match: offseasonMatchId, ...params } }),
      gameHref: (gameNumber) => `/offseason/draft/${offseasonMatchId}?game=${gameNumber}`,
    };
  }
  return {
    kind: "fixture",
    scopeId: fixtureId,
    table: "match_drafts",
    scopeColumn: "fixture_id",
    channel: `match-draft-${fixtureId}`,
    spectatorPath: `/match-draft/${fixtureId}`,
    rpc: (name, params = {}) => ({ name, params: { p_fixture: fixtureId, ...params } }),
    gameHref: (gameNumber) => `/match-draft/${fixtureId}?game=${gameNumber}`,
  };
}

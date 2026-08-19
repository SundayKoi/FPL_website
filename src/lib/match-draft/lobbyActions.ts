"use server";

import { createClient } from "@supabase/supabase-js";
import { drafterAccess } from "./access";
import type { OpenDraftLobbyTokens } from "./types";

export interface CreateLobbyInput {
  teamA: string;
  teamB: string;
  bestOf: number;
  fearless: boolean;
  playersA: string[];
  playersB: string[];
}

export type CreateLobbyResult =
  | { ok: true; lobby: OpenDraftLobbyTokens }
  | { ok: false; error: string };

function rpcErrorMessage(raw: string | undefined): string {
  if (!raw) return "The lobby could not be created — try again.";
  // RPC validation errors read "CODE: human message" — show just the message.
  if (/^[A-Z_]+:\s/.test(raw)) return raw.replace(/^[A-Z_]+:\s*/, "");
  return `The lobby could not be created. (${raw})`;
}

/**
 * Creates a public draft lobby — the ONLY path to create_open_draft_lobby,
 * which Postgres locks to service_role (20260826000011). Authorization is
 * the premium Discord gate in drafterAccess(); the RPC itself still
 * validates names/format and enforces the rate cap and 14-day cleanup.
 */
export async function createOpenDraftLobbyAction(input: CreateLobbyInput): Promise<CreateLobbyResult> {
  const access = await drafterAccess();
  if (!access.signedIn) {
    return { ok: false, error: "Sign in with Discord to create a lobby." };
  }
  if (!access.allowed) {
    return { ok: false, error: "Creating draft lobbies is a perk for premium Discord members." };
  }

  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await service.rpc("create_open_draft_lobby", {
    p_team_a: String(input.teamA ?? "").trim(),
    p_team_b: String(input.teamB ?? "").trim(),
    p_best_of: [1, 3, 5].includes(input.bestOf) ? input.bestOf : 3,
    p_fearless: Boolean(input.fearless),
    p_players_a: Array.isArray(input.playersA) ? input.playersA.slice(0, 5).map(String) : [],
    p_players_b: Array.isArray(input.playersB) ? input.playersB.slice(0, 5).map(String) : [],
  });
  if (error) {
    return { ok: false, error: rpcErrorMessage(error.message) };
  }
  return { ok: true, lobby: data as OpenDraftLobbyTokens };
}

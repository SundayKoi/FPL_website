"use server";

import { normalizeBasePlayerName } from "@/lib/players/normalize";
import { createServerSupabase } from "@/lib/supabase/server";

export type CardClaimActionInput = {
  season: string;
  summonerName: string;
  tag: string;
};

export type CardClaimActionResult = { ok: true } | { ok: false; error: string };

const FAILURE: CardClaimActionResult = { ok: false, error: "Unable to update card claim" };

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validInput(input: unknown): input is CardClaimActionInput {
  const value = input as Partial<CardClaimActionInput> | null;
  return Boolean(value && nonEmpty(value.season) && nonEmpty(value.summonerName) && nonEmpty(value.tag));
}

/** Resolve only a direct, unique canonical name in exactly one configured
 * league season. Alias normalization is intentionally excluded: a fuzzy or
 * ambiguous display-name match must never grant private team access. */
async function exactCanonicalPlayerId(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  input: CardClaimActionInput,
): Promise<string | null> {
  const { data: settings, error: settingsError } = await supabase
    .from("league_settings")
    .select("current_season, academy_season, featured_draft_id, academy_draft_id")
    .eq("id", 1)
    .maybeSingle();
  if (settingsError) return null;
  const row = settings as {
    current_season: string | null;
    academy_season: string | null;
    featured_draft_id: string | null;
    academy_draft_id: string | null;
  } | null;
  const matchingLeagues = [
    row?.current_season === input.season
      ? { league: "premier" as const, draftId: row.featured_draft_id }
      : null,
    row?.academy_season === input.season
      ? { league: "academy" as const, draftId: row.academy_draft_id }
      : null,
  ].filter((match): match is { league: "premier" | "academy"; draftId: string | null } => match !== null);
  if (matchingLeagues.length !== 1 || !matchingLeagues[0].draftId) return null;

  const { data: activePlayers, error: activePlayersError } = await supabase
    .from("players")
    .select("canonical_player_id")
    .eq("draft_id", matchingLeagues[0].draftId);
  if (activePlayersError) return null;
  const canonicalIds = [...new Set(
    ((activePlayers as { canonical_player_id: string | null }[] | null) ?? [])
      .map((player) => player.canonical_player_id)
      .filter((id): id is string => Boolean(id)),
  )];
  if (canonicalIds.length === 0) return null;

  const { data: candidates, error } = await supabase
    .from("player_pool")
    .select("id, normalized_name")
    .in("id", canonicalIds);
  if (error) return null;

  const normalized = normalizeBasePlayerName(input.summonerName);
  const matches = ((candidates as { id: string; normalized_name: string }[] | null) ?? [])
    .filter((candidate) => candidate.normalized_name === normalized);
  return matches.length === 1 ? matches[0].id : null;
}

/** Creates a card claim for the authenticated session. The optional
 * canonical mapping is derived on the server and is null unless exact. */
export async function requestCardClaim(input: CardClaimActionInput): Promise<CardClaimActionResult> {
  if (!validInput(input)) return FAILURE;

  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const profileId = userData.user?.id ?? null;
  if (!profileId) return FAILURE;

  const playerPoolId = await exactCanonicalPlayerId(supabase, input);
  const { error } = await supabase.from("card_claims").insert({
    season: input.season,
    summoner_name: input.summonerName,
    tag: input.tag,
    profile_id: profileId,
    player_pool_id: playerPoolId,
  });
  return error ? FAILURE : { ok: true };
}

/** The database RPC authorizes the reviewer and commits card ownership plus
 * any compatible canonical identity as one transaction. */
export async function approveCardClaim(input: CardClaimActionInput): Promise<CardClaimActionResult> {
  if (!validInput(input)) return FAILURE;

  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user?.id) return FAILURE;

  const { error } = await supabase.rpc("approve_card_claim", {
    p_season: input.season,
    p_summoner: input.summonerName,
    p_tag: input.tag,
  });
  return error ? FAILURE : { ok: true };
}

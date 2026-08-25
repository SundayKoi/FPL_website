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
  const { data: settings } = await supabase
    .from("league_settings")
    .select("current_season, academy_season")
    .eq("id", 1)
    .maybeSingle();
  const row = settings as { current_season: string | null; academy_season: string | null } | null;
  const matchingLeagues = [
    row?.current_season === input.season ? "premier" : null,
    row?.academy_season === input.season ? "academy" : null,
  ].filter((league): league is "premier" | "academy" => league !== null);
  if (matchingLeagues.length !== 1) return null;

  const seasonKey = matchingLeagues[0] === "academy" ? "academy-1" : "season-5";
  const { data: candidates, error } = await supabase
    .from("player_pool")
    .select("id, normalized_name")
    .eq("season_key", seasonKey);
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

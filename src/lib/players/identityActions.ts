"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import type { LeagueKey } from "./identity";

export type RequestIdentityInput = {
  playerPoolId: string;
  leagueTeamId: string;
  league: LeagueKey;
  season: string;
};

export type DecideIdentityInput = {
  linkId: string;
  decision: "approve" | "reject";
};

export type AssignIdentityInput = {
  playerPoolId: string;
  profileId: string;
  league: LeagueKey;
  season: string;
};

export type ReplaceIdentityInput = {
  linkId: string;
  profileId: string;
};

export type IdentityActionResult = { ok: true } | { ok: false; error: string };

type DatabaseError = { code?: string; message?: string } | null;

function isLeagueKey(value: unknown): value is LeagueKey {
  return value === "premier" || value === "academy";
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validRequestInput(input: unknown): input is RequestIdentityInput {
  const value = input as Partial<RequestIdentityInput> | null;
  return Boolean(
    value
      && nonEmptyString(value.playerPoolId)
      && nonEmptyString(value.leagueTeamId)
      && isLeagueKey(value.league)
      && nonEmptyString(value.season),
  );
}

function validDecisionInput(input: unknown): input is DecideIdentityInput {
  const value = input as Partial<DecideIdentityInput> | null;
  return Boolean(
    value
      && nonEmptyString(value.linkId)
      && (value.decision === "approve" || value.decision === "reject"),
  );
}

function validAssignInput(input: unknown): input is AssignIdentityInput {
  const value = input as Partial<AssignIdentityInput> | null;
  return Boolean(
    value
      && nonEmptyString(value.playerPoolId)
      && nonEmptyString(value.profileId)
      && isLeagueKey(value.league)
      && nonEmptyString(value.season),
  );
}

function validReplaceInput(input: unknown): input is ReplaceIdentityInput {
  const value = input as Partial<ReplaceIdentityInput> | null;
  return Boolean(
    value
      && nonEmptyString(value.linkId)
      && nonEmptyString(value.profileId),
  );
}

function friendlyIdentityError(error: DatabaseError): IdentityActionResult {
  const message = error?.message ?? "";
  if (error?.code === "23505" && /player_pool_id.*league.*season|player_identity_links_player_pool/i.test(message)) {
    return { ok: false, error: "Identity already linked" };
  }
  if (error?.code === "23505" && /profile_id.*league.*season|player_identity_links_profile/i.test(message)) {
    return { ok: false, error: "Profile already linked" };
  }
  return { ok: false, error: "Unable to update player identity" };
}

function mutationResult(data: unknown, error: DatabaseError): IdentityActionResult {
  if (error) return friendlyIdentityError(error);
  // PostgREST silently filters writes that do not satisfy RLS. Asking it to
  // return the affected id keeps a forged link id from looking successful.
  return Array.isArray(data) && data.length > 0
    ? { ok: true }
    : { ok: false, error: "Unable to update player identity" };
}

async function authenticatedSession() {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  return { supabase, profileId: userData.user?.id ?? null };
}

/** Creates a pending request for the current session only. RLS validates that
 * the requested team is an exact current roster match before accepting it. */
export async function requestPlayerIdentityClaim(input: RequestIdentityInput): Promise<IdentityActionResult> {
  if (!validRequestInput(input)) return { ok: false, error: "Unable to update player identity" };

  const { supabase, profileId } = await authenticatedSession();
  if (!profileId) return { ok: false, error: "Unable to update player identity" };

  const { error } = await supabase.from("player_identity_links").insert({
    player_pool_id: input.playerPoolId,
    profile_id: profileId,
    league_team_id: input.leagueTeamId,
    league: input.league,
    season: input.season,
    status: "pending",
    source: "team",
    requested_by: profileId,
  });
  return error ? friendlyIdentityError(error) : { ok: true };
}

/** Withdraws only the session owner's still-pending request. */
export async function withdrawPlayerIdentityClaim(linkId: string): Promise<IdentityActionResult> {
  if (!nonEmptyString(linkId)) return { ok: false, error: "Unable to update player identity" };

  const { supabase, profileId } = await authenticatedSession();
  if (!profileId) return { ok: false, error: "Unable to update player identity" };

  const { data, error } = await supabase
    .from("player_identity_links")
    .delete()
    .eq("id", linkId)
    .eq("profile_id", profileId)
    .eq("status", "pending")
    .select("id");
  return mutationResult(data, error);
}

/** Approves or rejects one request. The RLS policy and trigger constrain the
 * actor to an admin or the relevant captain and make captain approval
 * immutable except for the intended pending-to-approved transition. */
export async function decidePlayerIdentityClaim(input: DecideIdentityInput): Promise<IdentityActionResult> {
  if (!validDecisionInput(input)) return { ok: false, error: "Unable to update player identity" };

  const { supabase, profileId } = await authenticatedSession();
  if (!profileId) return { ok: false, error: "Unable to update player identity" };

  if (input.decision === "reject") {
    const { data, error } = await supabase.from("player_identity_links").delete().eq("id", input.linkId).select("id");
    return mutationResult(data, error);
  }

  const { data, error } = await supabase
    .from("player_identity_links")
    .update({ status: "approved", decided_by: profileId, decided_at: new Date().toISOString() })
    .eq("id", input.linkId)
    .eq("status", "pending")
    .select("id");
  return mutationResult(data, error);
}

/** Creates an immediately approved, unrostered admin identity link. The
 * selected profile is re-read by id; no display name or Discord identifier is
 * accepted as a persistence input. RLS permits the final insert only to an
 * administrator. */
export async function assignPlayerIdentity(input: AssignIdentityInput): Promise<IdentityActionResult> {
  if (!validAssignInput(input)) return { ok: false, error: "Unable to update player identity" };

  const { supabase, profileId: actorId } = await authenticatedSession();
  if (!actorId) return { ok: false, error: "Unable to update player identity" };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", input.profileId)
    .maybeSingle();
  if (profileError || !profile) return { ok: false, error: "Unable to update player identity" };

  const { error } = await supabase.from("player_identity_links").insert({
    player_pool_id: input.playerPoolId,
    profile_id: input.profileId,
    league_team_id: null,
    league: input.league,
    season: input.season,
    status: "approved",
    source: "admin",
    requested_by: actorId,
    decided_by: actorId,
    decided_at: new Date().toISOString(),
  });
  return error ? friendlyIdentityError(error) : { ok: true };
}

/** Atomically replaces the selected profile on an existing link. PostgreSQL
 * uniqueness checks and the update happen in one statement, so a conflicting
 * profile leaves the old identity row untouched. The trigger rejects field
 * changes by captains; RLS permits this admin replacement only to an admin. */
export async function replacePlayerIdentity(input: ReplaceIdentityInput): Promise<IdentityActionResult> {
  if (!validReplaceInput(input)) return { ok: false, error: "Unable to update player identity" };

  const { supabase, profileId: actorId } = await authenticatedSession();
  if (!actorId) return { ok: false, error: "Unable to update player identity" };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", input.profileId)
    .maybeSingle();
  if (profileError || !profile) return { ok: false, error: "Unable to update player identity" };

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("player_identity_links")
    .update({
      profile_id: input.profileId,
      status: "approved",
      source: "admin",
      requested_by: actorId,
      requested_at: now,
      decided_by: actorId,
      decided_at: now,
    })
    .eq("id", input.linkId)
    .select("id");
  return mutationResult(data, error);
}

/** Revocation is intentionally scoped only by link id. RLS decides whether
 * the current session is an admin or the captain of its exact roster team. */
export async function revokePlayerIdentity(linkId: string): Promise<IdentityActionResult> {
  if (!nonEmptyString(linkId)) return { ok: false, error: "Unable to update player identity" };

  const { supabase, profileId } = await authenticatedSession();
  if (!profileId) return { ok: false, error: "Unable to update player identity" };

  const { data, error } = await supabase.from("player_identity_links").delete().eq("id", linkId).select("id");
  return mutationResult(data, error);
}

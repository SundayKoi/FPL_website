"use server";

// The two halves of a one-time signing link: the owner mints one, the
// holder spends it. Both run on the service client — signature_invites
// has no PostgREST access at all, so these actions are the only doors.

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { INVITE_DAYS, inviteExpired, validSignatureDataUrl } from "./signing";

async function requireOwner(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { isOwner } = await fetchStaffTier(supabase);
  return isOwner;
}

/**
 * Mints a signing link for one identity. OWNER-gated: whoever holds the
 * link signs AS that identity, so handing one out is vouching that the
 * person on the other end is the person on the card.
 */
export async function createSignatureInviteAction(input: {
  season: string;
  summonerName: string;
  tag: string;
  displayName: string;
}): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  if (!(await requireOwner())) return { ok: false, error: "Owners only." };
  const displayName = input.displayName.trim();
  if (!input.season || !input.summonerName || !input.tag || !displayName) {
    return { ok: false, error: "Season, account and display name are all required." };
  }

  const token = randomBytes(16).toString("hex");
  const service = createBettingServiceClient();
  const { error } = await service.from("signature_invites").insert({
    token,
    season: input.season,
    summoner_name: input.summonerName,
    tag: input.tag,
    display_name: displayName,
    expires_at: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  });
  if (error) return { ok: false, error: "Could not mint the link — is the signature_invites migration applied?" };
  return { ok: true, token };
}

/**
 * Spends a signing link: validates the token (unused, unexpired), writes
 * the ink to card_art_prefs under the invite's identity, and burns the
 * token — all service-side, because the page this is called from is
 * public by design.
 */
export async function submitInviteSignatureAction(
  token: string,
  signature: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof token !== "string" || !/^[0-9a-f]{32}$/.test(token)) {
    return { ok: false, error: "That signing link isn't valid." };
  }
  if (!validSignatureDataUrl(signature)) {
    return { ok: false, error: "That signature didn't come through cleanly — try drawing it again." };
  }

  const service = createBettingServiceClient();
  const { data } = await service
    .from("signature_invites")
    .select("token, season, summoner_name, tag, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();
  const invite = data as {
    token: string;
    season: string;
    summoner_name: string;
    tag: string;
    expires_at: string;
    used_at: string | null;
  } | null;
  if (!invite) return { ok: false, error: "That signing link isn't valid." };
  if (invite.used_at) return { ok: false, error: "This link was already used — the signature is on file." };
  if (inviteExpired(invite.expires_at)) {
    return { ok: false, error: "This link has expired — ask for a fresh one." };
  }

  // Burn FIRST, atomically: the null-guard makes a double-submit race
  // spend the token exactly once, and losing an ink write to a burned
  // token is recoverable (mint another link) where double-writes under
  // one token are not auditable.
  const { data: burned } = await service
    .from("signature_invites")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token)
    .is("used_at", null)
    .select("token");
  if (!burned || burned.length === 0) {
    return { ok: false, error: "This link was already used — the signature is on file." };
  }

  const { error: writeError } = await service
    .from("card_art_prefs")
    .upsert(
      { season: invite.season, summoner_name: invite.summoner_name, tag: invite.tag, signature },
      { onConflict: "season,summoner_name,tag" },
    );
  if (writeError) {
    // Un-burn so the person can try again rather than needing a re-mint.
    await service.from("signature_invites").update({ used_at: null }).eq("token", token);
    return { ok: false, error: "Could not save the signature — try again." };
  }

  revalidatePath("/admin/champions");
  return { ok: true };
}

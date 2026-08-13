import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { bettingAccess } from "./access";
import { createBettingServiceClient } from "./service-client";
import type { BettingUser } from "./types";

const SIGNUP_BONUS_AMOUNT = 1000;

/**
 * Best-effort display name from Supabase's Discord OAuth metadata: `full_name`
 * (the common `user_metadata` field), then `custom_claims.global_name`
 * (Discord's server-side identity provider shape), then the plain `name`
 * field, and finally the Discord id itself — providers are inconsistent
 * about which of these end up populated.
 */
function resolveUsername(metadata: Record<string, unknown>, discordId: string): string {
  const customClaims = metadata.custom_claims as Record<string, unknown> | undefined;
  return (
    (metadata.full_name as string | undefined) ||
    (customClaims?.global_name as string | undefined) ||
    (metadata.name as string | undefined) ||
    discordId
  );
}

/**
 * The signed-in user's betting identity + wallet, or `null` when signed out
 * (or signed in without a linked Discord identity — betting requires one).
 *
 * Every call re-runs `grant_signup_bonus`, which is idempotent on the
 * Postgres side (only the first call for a Discord id credits the bonus;
 * later calls just refresh the cached username/avatar and, once, link
 * `profile_id`) — so this doubles as "sync my betting profile".
 */
export async function getBettingUser(): Promise<BettingUser | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;

  const discordIdentity = user.identities?.find((identity) => identity.provider === "discord");
  if (!discordIdentity) return null;

  const discordId = discordIdentity.id;
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const username = resolveUsername(metadata, discordId);
  const avatar = (metadata.avatar_url as string | undefined) ?? null;

  const service = createBettingServiceClient();
  const { error } = await service.rpc("grant_signup_bonus", {
    p_user: discordId,
    p_username: username,
    p_avatar: avatar,
    p_amount: SIGNUP_BONUS_AMOUNT,
    p_profile_id: user.id,
  });
  if (error) console.error("betting: grant_signup_bonus failed", error);

  const { data: profile } = await service
    .from("betting_profiles")
    .select("balance")
    .eq("discord_id", discordId)
    .single();

  const { allowed, staff } = await bettingAccess(discordId);

  return {
    discordId,
    profileId: user.id,
    username,
    balance: (profile as { balance: number } | null)?.balance ?? 0,
    allowed,
    staff,
  };
}

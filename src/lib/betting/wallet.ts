import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { bettingAccess } from "./access";
import { SIGNUP_BONUS_AMOUNT } from "./daily";
import { createBettingServiceClient } from "./service-client";
import type { BettingUser } from "./types";
import { patronActive } from "@/lib/patron/flames";

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
/**
 * Who is signed in, as a Discord id and a balance — READ-ONLY.
 *
 * getBettingUser() mints a wallet and credits the signup bonus as it goes,
 * which is right on a page that spends money and wrong on one that merely
 * shows a chip: the cards tab bar was creating wallets for people who had
 * only opened Browse. This resolves the same identity off the session and
 * reads the balance with a plain select. Null when nobody is signed in or
 * the account has no Discord identity; a balance of null when there is no
 * wallet yet, which is what a chip should hide rather than invent.
 */
export async function readBettingIdentity(): Promise<{ discordId: string; profileId: string; balance: number | null } | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;
  const discordId = user.identities?.find((identity) => identity.provider === "discord")?.id;
  if (!discordId) return null;
  const service = createBettingServiceClient();
  const { data: profile } = await service.from("betting_profiles").select("balance").eq("discord_id", discordId).maybeSingle();
  const balance = (profile as { balance: number } | null)?.balance;
  return { discordId, profileId: user.id, balance: typeof balance === "number" ? balance : null };
}

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
    .select("balance, patron_until")
    .eq("discord_id", discordId)
    .single();

  const { allowed, staff } = await bettingAccess(discordId);

  const patron = patronActive((profile as { patron_until?: string | null } | null)?.patron_until);
  return {
    discordId,
    profileId: user.id,
    username,
    balance: (profile as { balance: number; patron_until?: string | null } | null)?.balance ?? 0,
    ...(patron ? { patron: true } : {}),
    allowed,
    staff,
  };
}

import "server-only";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { fetchGuildMember } from "@/lib/betting/access";
import { createServerSupabase } from "@/lib/supabase/server";

const DEFAULT_PREMIUM_GUILD_ID = "1534318803318739146";
const DEFAULT_PREMIUM_ROLE_ID = "1534328431997620234";

/** The single product gate used by Premium HQ and premium-only tools. */
export interface PremiumAccess {
  signedIn: boolean;
  allowed: boolean;
  /** Discord could not answer; callers may show the safe degraded state. */
  inconclusive: boolean;
}

/**
 * FPL Premium lives in the betting guild when that configuration exists.
 * The drafter-specific variables remain a staging/backwards-compatible
 * fallback, so an older deployment can adopt the hub without a flag day.
 */
export function premiumGuildId(): string {
  return process.env.DISCORD_GUILD_ID ?? process.env.DRAFTER_GUILD_ID ?? DEFAULT_PREMIUM_GUILD_ID;
}

export function premiumRoleId(): string {
  return process.env.DISCORD_REQUIRED_ROLE_ID ?? process.env.DRAFTER_ROLE_ID ?? DEFAULT_PREMIUM_ROLE_ID;
}

/** Whether the current visitor may use FPL Premium. */
export async function premiumAccess(): Promise<PremiumAccess> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { signedIn: false, allowed: false, inconclusive: false };

  const staffTier = await fetchStaffTier(supabase);
  if (staffTier.isAdmin || staffTier.isOwner) {
    return { signedIn: true, allowed: true, inconclusive: false };
  }

  const discordId = user.identities?.find((identity) => identity.provider === "discord")?.id;
  if (!discordId) return { signedIn: true, allowed: false, inconclusive: false };

  // Local development and test environments may intentionally omit Discord.
  if (!process.env.DISCORD_BOT_TOKEN) {
    return { signedIn: true, allowed: true, inconclusive: false };
  }

  const member = await fetchGuildMember(discordId, premiumGuildId());
  if (member === null) {
    console.warn(`premiumAccess: Discord membership check inconclusive for ${discordId}`);
    return { signedIn: true, allowed: true, inconclusive: true };
  }

  return {
    signedIn: true,
    allowed: member.inGuild && member.roles.includes(premiumRoleId()),
    inconclusive: false,
  };
}

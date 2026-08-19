import "server-only";
import { fetchGuildMember } from "@/lib/betting/access";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { createServerSupabase } from "@/lib/supabase/server";

// The premium Discord server + role that unlock lobby creation. Snowflake
// ids are public identifiers (the bot token is the secret); env vars
// override for staging. The bot behind DISCORD_BOT_TOKEN must be a member
// of this guild for the check to answer.
const PREMIUM_GUILD_ID = process.env.DRAFTER_GUILD_ID ?? "1534318803318739146";
const PREMIUM_ROLE_ID = process.env.DRAFTER_ROLE_ID ?? "1534328431997620234";

export interface DrafterAccess {
  signedIn: boolean;
  allowed: boolean;
  /** Discord couldn't answer (outage/rate limit) — allowed fail-open. */
  inconclusive: boolean;
}

/**
 * Whether the current visitor may CREATE public draft lobbies: signed in
 * with Discord and holding the premium role in the premium server (site
 * admins/owners always pass). Follows the betting gate's fail-open policy —
 * no bot token configured means the gate is off, and a Discord outage
 * admits rather than locking members out. Lobby links themselves stay open
 * to whoever holds them; only creation is gated.
 */
export async function drafterAccess(): Promise<DrafterAccess> {
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

  if (!process.env.DISCORD_BOT_TOKEN) {
    return { signedIn: true, allowed: true, inconclusive: false };
  }

  const member = await fetchGuildMember(discordId, PREMIUM_GUILD_ID);
  if (member === null) {
    console.warn(`drafterAccess: Discord membership check inconclusive for ${discordId}`);
    return { signedIn: true, allowed: true, inconclusive: true };
  }
  return {
    signedIn: true,
    allowed: member.inGuild && member.roles.includes(PREMIUM_ROLE_ID),
    inconclusive: false,
  };
}

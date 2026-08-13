import { createServerSupabase } from "@/lib/supabase/server";
import { createBettingServiceClient } from "./service-client";
import type { BettingAccessResult, BettingStaffContext, GuildMember } from "./types";

const MEMBER_CACHE_TTL_MS = 60_000;
const MEMBER_FETCH_TIMEOUT_MS = 5_000;

// Inconclusive (null) results are deliberately cached for the full TTL too —
// during a Discord outage this stops every request from re-hitting (and
// re-timing-out against) Discord for the same 60s window.
const memberCache = new Map<string, { at: number; value: GuildMember | null }>();

/** Test-only: clears the module-level guild-member cache between cases. */
export function _clearMemberCache(): void {
  memberCache.clear();
}

/**
 * Guild membership + roles for a Discord id, fetched via the bot token.
 * 200 → the member's roles; 404 → not in the guild; anything else (rate
 * limit, outage, network error) → null ("inconclusive" — the caller decides
 * the fail-open policy, see `bettingAccess`). Cached per id for 60s so a
 * burst of checks in one request doesn't hammer Discord.
 */
export async function fetchGuildMember(discordId: string): Promise<GuildMember | null> {
  const cached = memberCache.get(discordId);
  if (cached && Date.now() - cached.at < MEMBER_CACHE_TTL_MS) {
    return cached.value;
  }

  const guildId = process.env.DISCORD_GUILD_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  let value: GuildMember | null;
  try {
    // Bounded so a hung Discord response can't block the calling request
    // indefinitely — a timeout lands in the catch below, same as any other
    // network failure, and resolves to the inconclusive (null) path.
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`, {
      headers: { Authorization: `Bot ${botToken}` },
      signal: AbortSignal.timeout(MEMBER_FETCH_TIMEOUT_MS),
    });
    if (res.status === 200) {
      const body = (await res.json()) as { roles?: string[] };
      value = { inGuild: true, roles: body.roles ?? [] };
    } else if (res.status === 404) {
      value = { inGuild: false, roles: [] };
    } else {
      value = null;
    }
  } catch {
    value = null;
  }

  memberCache.set(discordId, { at: Date.now(), value });
  return value;
}

/**
 * Betting access for a Discord id — fails open like the exchange: a
 * misconfigured or unreachable Discord never locks the whole site out.
 *
 * - No `DISCORD_GUILD_ID`/`DISCORD_BOT_TOKEN` configured → the gate is off
 *   entirely (matches the source's "only gate when configured" policy).
 * - Discord answers but is inconclusive (rate limit/outage) → allowed, with
 *   `inconclusive: true` so callers can log/surface it.
 * - Not a member of the guild → denied.
 * - A member → allowed iff holding `DISCORD_REQUIRED_ROLE_ID` (or that env
 *   is unset, in which case every guild member is allowed); staff iff
 *   holding `DISCORD_STAFF_ROLE_ID`.
 */
export async function bettingAccess(discordId: string): Promise<BettingAccessResult> {
  // Dev escape hatch (e2e/local only — never in production): skips the
  // Discord round trip entirely, so a seeded fixture with no real Discord
  // guild membership can still exercise the betting flow end to end.
  // Deliberately checked BEFORE the guild/bot-token short-circuit below (so
  // it works even when Discord *is* configured) but gated on NODE_ENV so a
  // misconfigured production deploy can never open the gate this way.
  if (process.env.BETTING_GATE_DISABLED === "1" && process.env.NODE_ENV !== "production") {
    return { allowed: true, staff: false, inconclusive: false };
  }

  const guildId = process.env.DISCORD_GUILD_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!guildId || !botToken) {
    return { allowed: true, staff: false, inconclusive: false };
  }

  const member = await fetchGuildMember(discordId);
  if (member === null) {
    console.warn(`bettingAccess: Discord membership check inconclusive for ${discordId}`);
    return { allowed: true, staff: false, inconclusive: true };
  }
  if (!member.inGuild) {
    return { allowed: false, staff: false, inconclusive: false };
  }

  const requiredRoleId = process.env.DISCORD_REQUIRED_ROLE_ID;
  const staffRoleId = process.env.DISCORD_STAFF_ROLE_ID;
  const allowed = !requiredRoleId || member.roles.includes(requiredRoleId);
  const staff = !!staffRoleId && member.roles.includes(staffRoleId);
  return { allowed, staff, inconclusive: false };
}

/**
 * Throws unless the signed-in user is betting staff: holding the Discord
 * Staff role, or a site admin (`profiles.is_admin` — site admins are
 * betting admins too, checked via the service client since the anon client
 * has no privileged reason to see another user's admin flag). Meant to be
 * the first call in every admin betting action (Task 9).
 */
export async function requireBettingStaff(): Promise<BettingStaffContext> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const discordIdentity = user?.identities?.find((identity) => identity.provider === "discord");
  if (!user || !discordIdentity) {
    throw new Error("betting: staff only");
  }

  const discordId = discordIdentity.id;
  const { staff } = await bettingAccess(discordId);
  if (staff) {
    return { discordId, profileId: user.id };
  }

  const service = createBettingServiceClient();
  const { data: profile } = await service.from("profiles").select("is_admin").eq("id", user.id).single();
  if (profile?.is_admin) {
    return { discordId, profileId: user.id };
  }

  throw new Error("betting: staff only");
}

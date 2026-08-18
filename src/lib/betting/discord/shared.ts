// Helpers shared by the slash-command handlers (commands.ts) and the
// message-component/modal handlers (components.ts) — the ensure-user wallet
// provisioning pattern and its supporting pieces.
import "server-only";
import type { createBettingServiceClient } from "../service-client";
import type { DiscordInteraction } from "./registry";

type BettingServiceClient = ReturnType<typeof createBettingServiceClient>;

/** One-time signup credit for a Discord id's first contact with the wallet
 * system, granted via `grant_signup_bonus` before every wallet-touching
 * handler runs (the "ensure-user" pattern) — matches wallet.ts's
 * `SIGNUP_BONUS_AMOUNT`, which does the same thing for the web login path. */
export const SIGNUP_BONUS = 1000;

/** SITE_URL is the spec'd/primary name; NEXT_PUBLIC_SITE_URL (the rest of
 * the repo's canonical-origin var — see auth/siteOrigin.ts) is accepted as a
 * fallback so a deploy only has to set one of the two. */
export function siteUrl(): string {
  return process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
}

export interface DiscordUser {
  id: string;
  username?: string;
  global_name?: string;
  avatar?: string | null;
  bot?: boolean;
}

/** Every interaction handled here is guild-only (commands are registered
 * per-guild, never globally) — a DM interaction has no `member`, so this is a
 * defensive guard rather than an expected path in production. */
export function requireMember(interaction: DiscordInteraction): DiscordUser | null {
  const user: DiscordUser | undefined = interaction.member?.user;
  return user?.id ? user : null;
}

export function avatarUrl(user: DiscordUser | undefined): string | null {
  if (!user?.avatar) return null;
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
}

/** Provisions the wallet on first contact (idempotent server-side) — the
 * "ensure-user" pattern every wallet-touching handler runs first. */
export async function ensureUser(service: BettingServiceClient, user: DiscordUser): Promise<void> {
  await service.rpc("grant_signup_bonus", {
    p_user: user.id,
    p_username: user.username ?? user.id,
    p_avatar: avatarUrl(user),
    p_amount: SIGNUP_BONUS,
  });
}

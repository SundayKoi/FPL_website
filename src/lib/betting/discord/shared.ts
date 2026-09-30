// Helpers shared by the slash-command handlers (commands.ts) and the
// message-component/modal handlers (components.ts) — the ensure-user wallet
// provisioning pattern and its supporting pieces.
import "server-only";
import type { createBettingServiceClient } from "../service-client";
import type { DiscordInteraction } from "./registry";
import { SIGNUP_BONUS_AMOUNT } from "../daily";
import type { CardLeague } from "@/lib/cards/queries";

type BettingServiceClient = ReturnType<typeof createBettingServiceClient>;

/** One-time signup credit for a Discord id's first contact with the wallet
 * system, granted via `grant_signup_bonus` before every wallet-touching
 * handler runs (the "ensure-user" pattern) — the same constant wallet.ts
 * uses on the web login path, so the two can never drift. */
export const SIGNUP_BONUS = SIGNUP_BONUS_AMOUNT;

export { siteUrl } from "@/lib/site/url";

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

function rawOption(interaction: DiscordInteraction, name: string): unknown {
  const options = (interaction.data?.options ?? []) as { name: string; value?: unknown }[];
  return options.find((option) => option.name === name)?.value;
}

/** A string option, trimmed; absent or blank is null. */
export function stringOption(interaction: DiscordInteraction, name: string): string | null {
  const raw = rawOption(interaction, name);
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/** The card commands' `league` option; defaults to premier. */
export function leagueOption(interaction: DiscordInteraction): CardLeague {
  return rawOption(interaction, "league") === "academy" ? "academy" : "premier";
}

/** How a card command's public follow-up names its caller. */
export function callerName(member: DiscordUser): string {
  return member.global_name ?? member.username ?? "Someone";
}

/** Answers a deferred interaction through its follow-up webhook. */
export async function postFollowup(interaction: DiscordInteraction, body: object): Promise<void> {
  await fetch(`https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

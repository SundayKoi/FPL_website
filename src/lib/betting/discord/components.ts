// Discord message-component + modal-submit handlers for the bet-from-Discord
// flow — port of the gateway bot's BetButton/BetAmountModal
// (c:\fpl_gambling\bot\main.py). Wire format is unchanged from the old bot so
// buttons on pre-cutover messages keep working: a bet button's custom_id is
// `bet:<marketId>:<teamId>:<code>` (teamId -1 = the draw); its modal's
// custom_id is `betmodal:<marketId>:<teamId>:<code>`.
//
// Every exported handler is wired into componentHandlers/modalHandlers
// (registry.ts) at the bottom of this file — importing this module (route.ts
// does, for its side effects, same pattern as commands.ts) is what makes the
// registration happen. The interactions endpoint's access gate (route.ts's
// hasAccess) already runs before any handler here, so — unlike the gateway
// bot's DynamicItem, which sat outside the slash-command tree's
// interaction_check and needed its own has_access call — nothing here
// re-checks role access.
import "server-only";
import { createBettingServiceClient } from "../service-client";
import { fmtPoints } from "../format";
import { friendlyPlaceBetError } from "../bet-errors";
import { componentHandlers, modalHandlers } from "./registry";
import type { DiscordInteraction } from "./registry";
import { BRAND, GREEN, embed, errMsg, modal } from "./respond";
import type { DiscordEmbed } from "./respond";
import { avatarUrl, ensureUser, requireMember, siteUrl } from "./shared";
import type { DiscordUser } from "./shared";

/** Parsed `bet:<marketId>:<teamId>:<code>` / `betmodal:<marketId>:<teamId>:<code>`
 * custom_id. teamId -1 is the RPC's "the Draw" sentinel. Returns null on any
 * malformed id rather than throwing — a hand-crafted or stale custom_id
 * should surface as an ordinary error reply, never a 500. */
interface ParsedBetId {
  marketId: number;
  teamId: number;
  code: string;
}

function parseBetCustomId(customId: string): ParsedBetId | null {
  const parts = customId.split(":");
  if (parts.length !== 4) return null;
  const marketId = Number(parts[1]);
  const teamId = Number(parts[2]);
  const code = parts[3];
  if (!Number.isInteger(marketId) || !Number.isInteger(teamId) || !code) return null;
  return { marketId, teamId, code };
}

/** The bettor's display name for the public shout's author strip — prefers
 * the per-server nickname (interaction.member.nick), then the account's
 * global display name, then its username. Mirrors discord.py's
 * `Member.display_name` resolution order, which main.py's public shout
 * (bot/main.py:118) used via `interaction.user.display_name`. */
function displayName(interaction: DiscordInteraction, member: DiscordUser): string {
  return interaction.member?.nick ?? member.global_name ?? member.username ?? member.id;
}

// ---- bet:<marketId>:<teamId>:<code> — button press ---------------------------

async function handleBetButton(interaction: DiscordInteraction): Promise<object> {
  const customId = interaction.data?.custom_id;
  const parsed = customId ? parseBetCustomId(customId) : null;
  if (!parsed) return errMsg("Something went wrong.");

  const service = createBettingServiceClient();
  const { data } = await service
    .from("betting_markets")
    .select("status")
    .eq("id", parsed.marketId)
    .maybeSingle();
  const status = (data as { status: string } | null)?.status;

  if (status !== "OPEN") {
    return errMsg("This market is closed for betting.");
  }

  return modal(`betmodal:${parsed.marketId}:${parsed.teamId}:${parsed.code}`, `Bet on ${parsed.code}`, [
    // max_length 12 — port of main.py's BetAmountModal TextInput
    // (bot/main.py:84): caps the raw input client-side so an absurdly long
    // digit string can't parse to Infinity/overflow before parseAmount runs.
    { custom_id: "amount", label: "Amount", placeholder: "e.g. 500", max_length: 12 },
  ]);
}

// ---- betmodal:<marketId>:<teamId>:<code> — stake modal submit ----------------

/** Pulls the "amount" text-input's value out of a modal-submit interaction's
 * nested action-row/component structure (registry.ts's `DiscordInteraction`
 * models this same shape for `data.components`). */
function modalAmountValue(interaction: DiscordInteraction): string {
  return interaction.data?.components?.[0]?.components?.[0]?.value ?? "";
}

/** Strips commas/`$` and requires an all-digit, positive amount — port of
 * main.py's BetAmountModal.on_submit parsing verbatim. */
function parseAmount(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, "").replace(/\$/g, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const amount = Number(cleaned);
  return amount > 0 ? amount : null;
}

/** Posts the public "🎲 ... bet $N on CODE!" shout to the channel the
 * interaction fired in — port of main.py's `interaction.channel.send(...)`
 * try/except HTTPException: pass, including the author strip main.py set
 * via `pub.set_author(name=..., icon_url=...)` (bot/main.py:118-119).
 * Best-effort only: the private confirmation has already been decided by the
 * time this runs, so any failure here (missing perms, network error, missing
 * channel id/bot token) is swallowed rather than surfaced — the bettor still
 * sees their confirmation. */
async function postPublicShout(
  channelId: string | undefined,
  description: string,
  author: { name: string; icon_url: string | null },
): Promise<void> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!channelId || !botToken) return;
  try {
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        embeds: [{ description, color: BRAND, author: { name: author.name, icon_url: author.icon_url } }],
      }),
    });
  } catch {
    // network failure — non-fatal, matches main.py's `pass`
  }
}

async function handleBetModalSubmit(interaction: DiscordInteraction): Promise<object> {
  const customId = interaction.data?.custom_id;
  const parsed = customId ? parseBetCustomId(customId) : null;
  const member = requireMember(interaction);
  if (!parsed || !member) return errMsg("Something went wrong.");

  const amount = parseAmount(modalAmountValue(interaction));
  if (amount === null) {
    return errMsg("Enter a whole positive amount.");
  }

  const service = createBettingServiceClient();
  await ensureUser(service, member);

  const { data, error } = await service.rpc("place_bet", {
    p_user: member.id,
    p_market: parsed.marketId,
    p_team: parsed.teamId,
    p_amount: amount,
  });
  if (error) return errMsg(friendlyPlaceBetError(error.message));

  const balance = data as number;
  const site = siteUrl();
  const confirmEmbed: DiscordEmbed = {
    description:
      `✅ Bet **${fmtPoints(amount)}** on **${parsed.code}** placed! Balance **${fmtPoints(balance)}**.\n` +
      `[View market](${site}/betting/market/${parsed.marketId})`,
    color: GREEN,
  };

  await postPublicShout(
    interaction.channel_id,
    `🎲 <@${member.id}> bet **${fmtPoints(amount)}** on **${parsed.code}**!`,
    { name: displayName(interaction, member), icon_url: avatarUrl(member) },
  );

  return embed(confirmEmbed, true);
}

// ---- registration -----------------------------------------------------------
// Direct assignment into the shared registry maps (registry.ts), same
// convention as commands.ts — route.ts imports this module for its side
// effects (see this file's own header comment).
componentHandlers.bet = handleBetButton;
modalHandlers.betmodal = handleBetModalSubmit;

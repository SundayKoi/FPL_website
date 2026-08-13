// Discord HTTP-interactions endpoint — replaces the gateway bot's command
// dispatch (c:\fpl_gambling\bot\main.py) with a webhook Discord POSTs every
// slash command, button click, select-menu pick, and modal submit to.
// Docs: https://discord.com/developers/docs/interactions/receiving-and-responding
//
// WebCrypto Ed25519 verification needs the Node runtime (default in Next 16,
// but pinned explicitly since correctness here depends on it).
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import type { DiscordInteraction, Handler } from "@/lib/betting/discord/registry";
import { commandHandlers, componentHandlers, modalHandlers } from "@/lib/betting/discord/registry";
import { errMsg, pong } from "@/lib/betting/discord/respond";
import { verifyDiscordSignature } from "@/lib/betting/discord/verify";
// Side-effect import only: commands.ts registers its slash-command handlers
// into `commandHandlers` (registry.ts) at module load — see its own header
// comment. Nothing here references the module's exports directly; it must
// still be imported somewhere reachable from this route for that
// registration to run at all, and this file is the interactions webhook's
// single entrypoint.
import "@/lib/betting/discord/commands";
// Side-effect import only: components.ts registers the bet-button/stake-modal
// handlers into componentHandlers/modalHandlers (registry.ts) at module load
// — same reasoning as the commands.ts import above.
import "@/lib/betting/discord/components";

// Exact copy of the old bot's NO_ACCESS_MSG (bot/main.py) — same wording
// users already saw from the gateway bot's paid-access gate.
const NO_ACCESS_MSG =
  "FPL Exchange is for **FPL Better** members — ask the staff about getting access.";

const INTERACTION_TYPE = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  MODAL_SUBMIT: 5,
} as const;

/** custom_id convention across this endpoint: everything before the first
 * `:` names the handler; anything after encodes the handler's own state
 * (market id, team id, ...) — mirrors the old bot's `bet:<market>:<team>:<code>`. */
function customIdPrefix(customId: string): string {
  const i = customId.indexOf(":");
  return i === -1 ? customId : customId.slice(0, i);
}

/** True when the interaction's member/role data satisfies the access gate.
 * PING is never gated (handled before this is called). No required-role env
 * → open, matching lib/betting/access.ts's fail-open convention. A DM (no
 * `member`) is denied whenever a role is required — DMs carry no roles. */
function hasAccess(interaction: DiscordInteraction): boolean {
  const requiredRoleId = process.env.DISCORD_REQUIRED_ROLE_ID;
  if (!requiredRoleId) return true;
  return interaction.member?.roles.includes(requiredRoleId) ?? false;
}

function resolveHandler(interaction: DiscordInteraction): Handler | undefined {
  switch (interaction.type) {
    case INTERACTION_TYPE.APPLICATION_COMMAND:
      return interaction.data?.name ? commandHandlers[interaction.data.name] : undefined;
    case INTERACTION_TYPE.MESSAGE_COMPONENT:
      return interaction.data?.custom_id ? componentHandlers[customIdPrefix(interaction.data.custom_id)] : undefined;
    case INTERACTION_TYPE.MODAL_SUBMIT:
      return interaction.data?.custom_id ? modalHandlers[customIdPrefix(interaction.data.custom_id)] : undefined;
    default:
      return undefined;
  }
}

export async function POST(req: Request): Promise<Response> {
  // The signature covers the raw request bytes, so the body MUST be read as
  // text before any JSON.parse — re-serializing parsed JSON can change the
  // byte content and break verification.
  const rawBody = await req.text();
  const signature = req.headers.get("X-Signature-Ed25519");
  const timestamp = req.headers.get("X-Signature-Timestamp");

  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) {
    // Misconfiguration, not an auth failure — fail closed with 500 so it's
    // never mistaken for "Discord sent a bad signature" (401).
    return new NextResponse("Discord interactions endpoint misconfigured", { status: 500 });
  }

  if (!signature || !timestamp || !(await verifyDiscordSignature(publicKey, signature, timestamp, rawBody))) {
    return new NextResponse("invalid request signature", { status: 401 });
  }

  const interaction = JSON.parse(rawBody) as DiscordInteraction;

  if (interaction.type === INTERACTION_TYPE.PING) {
    return NextResponse.json(pong());
  }

  if (!hasAccess(interaction)) {
    return NextResponse.json(errMsg(NO_ACCESS_MSG));
  }

  const handler = resolveHandler(interaction);
  if (!handler) {
    return NextResponse.json(errMsg("Unknown interaction."));
  }

  return NextResponse.json(await handler(interaction));
}

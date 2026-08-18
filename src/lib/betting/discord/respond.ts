// Discord interaction-response builders. Every Discord HTTP interaction
// (https://discord.com/developers/docs/interactions/receiving-and-responding)
// must be answered with one JSON body of the shape `{ type, data? }`; these
// helpers build the common shapes so route handlers/command handlers never
// hand-roll the envelope. Colors/prefix mirror the old gateway bot's
// BRAND/GREEN/RED + err_embed (c:\fpl_gambling\bot\main.py).

export const BRAND = 0x0e3050;
export const GREEN = 0x34e98a;
export const RED = 0xff5063;

/** Discord interaction callback types we build responses for. */
const CALLBACK_TYPE = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  MODAL: 9,
} as const;

/** Discord message flag for an ephemeral (only-the-invoker-sees-it) response. */
const EPHEMERAL_FLAG = 64;

/** A Discord embed object — loosely typed since we only ever set a handful
 * of the many fields Discord's embed schema supports. */
export type DiscordEmbed = Record<string, unknown>;

/** A Discord message component row (buttons, select menus, ...). */
export type DiscordComponent = Record<string, unknown>;

interface MessageResponseData {
  content?: string;
  embeds?: DiscordEmbed[];
  flags?: number;
  components?: DiscordComponent[];
}

/** `{ type: 1 }` — the mandatory reply to Discord's PING verification request. */
export function pong(): { type: 1 } {
  return { type: CALLBACK_TYPE.PONG };
}

/** A plain-text message response (type 4), optionally ephemeral. */
export function msg(content: string, ephemeral = false): { type: 4; data: MessageResponseData } {
  return {
    type: CALLBACK_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, ...(ephemeral ? { flags: EPHEMERAL_FLAG } : {}) },
  };
}

/** A single-embed message response (type 4), optionally ephemeral, with
 * optional components (buttons/select menus) attached. */
export function embed(
  e: DiscordEmbed,
  ephemeral = false,
  components?: DiscordComponent[],
): { type: 4; data: MessageResponseData } {
  return {
    type: CALLBACK_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      embeds: [e],
      ...(ephemeral ? { flags: EPHEMERAL_FLAG } : {}),
      ...(components ? { components } : {}),
    },
  };
}

/** Red embed with a "❌ " prefix — port of the old bot's `err_embed`. */
export function errEmbed(message: string): DiscordEmbed {
  return { description: `❌ ${message}`, color: RED };
}

/** An ephemeral error-embed response (type 4) — the common denial shape. */
export function errMsg(message: string): { type: 4; data: MessageResponseData } {
  return embed(errEmbed(message), true);
}

/** One modal text-input field (a type-4 component inside its type-1 row). */
export interface ModalTextInput {
  custom_id: string;
  label: string;
  /** 1 = short (single line), 2 = paragraph (multi-line). Defaults to short. */
  style?: 1 | 2;
  placeholder?: string;
  required?: boolean;
  max_length?: number;
  min_length?: number;
  value?: string;
}

/** A modal popup response (type 9) — Discord wraps each field in its own
 * action-row (type 1), one field per row, per the interactions schema. */
export function modal(
  customId: string,
  title: string,
  fields: ModalTextInput[],
): { type: 9; data: { custom_id: string; title: string; components: DiscordComponent[] } } {
  return {
    type: CALLBACK_TYPE.MODAL,
    data: {
      custom_id: customId,
      title,
      components: fields.map((field) => ({
        type: 1,
        components: [{ type: 4, style: 1, ...field }],
      })),
    },
  };
}

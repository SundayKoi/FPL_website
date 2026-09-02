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
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  APPLICATION_COMMAND_AUTOCOMPLETE_RESULT: 8,
  MODAL: 9,
} as const;

/** Discord shows at most this many autocomplete choices, and rejects the
 *  whole response — the user sees nothing — when sent more. */
export const AUTOCOMPLETE_LIMIT = 25;

/** Discord's cap on a choice's visible name; a longer one is a 400. */
const CHOICE_NAME_MAX = 100;

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

/** One autocomplete suggestion: what the picker shows, and what the command
 *  receives when it is picked. */
export interface AutocompleteChoice {
  name: string;
  value: string;
}

/** An autocomplete response (type 8). Clamped to what Discord will accept
 *  rather than trusting every caller to count: over the limit or over the
 *  name length, Discord drops the entire list, which reads to the user as
 *  "autocomplete is broken" rather than as any specific mistake. */
export function autocomplete(choices: AutocompleteChoice[]): { type: 8; data: { choices: AutocompleteChoice[] } } {
  return {
    type: CALLBACK_TYPE.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
    data: {
      choices: choices.slice(0, AUTOCOMPLETE_LIMIT).map((choice) => ({
        name: choice.name.length > CHOICE_NAME_MAX ? `${choice.name.slice(0, CHOICE_NAME_MAX - 1)}…` : choice.name,
        value: choice.value,
      })),
    },
  };
}

/** `{ type: 5 }` — "thinking…" acknowledgment for a handler whose real work
 * runs after the response (Discord's 3-second deadline is for the ACK, not
 * the answer; the answer follows on the interaction's webhook). */
export function deferred(): { type: 5 } {
  return { type: CALLBACK_TYPE.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE };
}

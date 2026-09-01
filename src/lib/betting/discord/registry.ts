// Handler registry for the Discord interactions endpoint (route.ts). Tasks
// 11-12 populate these maps with the real command/component/modal handlers;
// this task ships them empty so unmatched interactions fall through to the
// route's "Unknown interaction." response.

/** The subset of a Discord interaction payload our handlers need. Discord's
 * full interaction schema (https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object)
 * has many more fields (guild locale, entitlements, etc.) that no handler
 * here reads yet — left untyped (`any`) rather than modeled up front. */
export interface DiscordInteraction {
  id: string;
  application_id: string;
  /** 1 PING, 2 APPLICATION_COMMAND, 3 MESSAGE_COMPONENT, 4 APPLICATION_COMMAND_AUTOCOMPLETE, 5 MODAL_SUBMIT. */
  type: number;
  token: string;
  /** Present for slash/user/message commands (type 2). */
  data?: {
    name?: string;
    custom_id?: string;
    options?: unknown[];
    components?: Array<{ components?: Array<{ custom_id: string; value: string }> }>;
  };
  /** Guild member context — present when the interaction fires inside a
   * guild; absent for DMs (`user` is set instead). `nick` is the member's
   * per-server display name override (Discord's guild member object), used
   * by components.ts's public bet shout to prefer the name shown in-server
   * over the account-wide username/global_name. */
  member?: {
    user?: { id: string; username?: string; global_name?: string; avatar?: string | null };
    nick?: string | null;
    roles: string[];
  };
  /** Present for DM interactions (no `member`). */
  user?: { id: string; username?: string; global_name?: string; avatar?: string | null };
  guild_id?: string;
  channel_id?: string;
  message?: Record<string, unknown>;
}

/** A handler answers one interaction with its Discord response body. */
export type Handler = (interaction: DiscordInteraction) => Promise<object>;

/** Slash/user/message command handlers, keyed by `data.name`. */
export const commandHandlers: Record<string, Handler> = {};

/** Message-component (button/select-menu) handlers, keyed by the segment of
 * `data.custom_id` before its first `:` (e.g. `"bet:42:-1:ARS"` → `"bet"`). */
export const componentHandlers: Record<string, Handler> = {};

/** Modal-submit handlers, keyed by the same custom_id-prefix convention as
 * `componentHandlers`. */
export const modalHandlers: Record<string, Handler> = {};

/** Autocomplete handlers, keyed by `data.name` like `commandHandlers`. Discord
 * sends one of these on every keystroke in an option registered with
 * `autocomplete: true`, and expects `autocomplete()` (respond.ts) back inside
 * the same three seconds a command gets — there is no deferral for these, so
 * a handler here reads once and answers. */
export const autocompleteHandlers: Record<string, Handler> = {};

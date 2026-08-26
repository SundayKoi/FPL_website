/**
 * scripts/register-discord-commands.ts — registers this repo's Discord slash
 * commands (the interactions-webhook handlers in
 * src/lib/betting/discord/commands.ts) against one guild.
 *
 * Names/descriptions/options are ported verbatim from the source gateway
 * bot's `@tree.command`/`@app_commands.describe` decorators
 * (c:\fpl_gambling\bot\main.py) for the eight commands this task ports:
 * balance, daily, tip, bets, leaderboard, exchange, store, buy. `/buy`'s
 * autocomplete (`buy_item_autocomplete` in the source) is NOT ported here —
 * that needs its own interaction type (APPLICATION_COMMAND_AUTOCOMPLETE, not
 * registration) which this task doesn't implement, so `item` just registers
 * as a plain required integer option.
 *
 * PUTs the full command array to Discord's guild-commands endpoint, which
 * is declarative: any command already registered but missing from this
 * array is deleted, same as re-running `tree.sync()` in the source bot.
 *
 * Needs DISCORD_APP_ID, DISCORD_GUILD_ID, DISCORD_BOT_TOKEN in the
 * environment. Run with: npx tsx scripts/register-discord-commands.ts
 */

import { DISCORD_COMMANDS } from "../src/lib/betting/discord/commandDefs";

function resolveConfig(): { appId: string; guildId: string; botToken: string } {
  const appId = process.env.DISCORD_APP_ID;
  const guildId = process.env.DISCORD_GUILD_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!appId || !guildId || !botToken) {
    throw new Error("DISCORD_APP_ID, DISCORD_GUILD_ID, and DISCORD_BOT_TOKEN must all be set.");
  }
  return { appId, guildId, botToken };
}

async function main() {
  const { appId, guildId, botToken } = resolveConfig();

  const res = await fetch(`https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(DISCORD_COMMANDS),
  });

  console.log(`PUT guild commands -> ${res.status} ${res.statusText}`);
  if (!res.ok) {
    const body = await res.text();
    console.error(body);
    // 20012 has exactly one cause: the bot token and DISCORD_APP_ID belong
    // to two different Discord applications. Rather than leave that to be
    // guessed at, ask Discord which application the TOKEN thinks it is and
    // print both ids — the mismatch names the secret to fix.
    if (body.includes('"code": 20012') || body.includes('"code":20012')) {
      const who = await fetch("https://discord.com/api/v10/applications/@me", {
        headers: { Authorization: `Bot ${botToken}` },
      });
      if (who.ok) {
        const app = (await who.json()) as { id: string; name: string };
        console.error(
          `\nDISCORD_APP_ID is set to ${appId}, but DISCORD_BOT_TOKEN belongs to ` +
            `application ${app.id} ("${app.name}").\n` +
            (app.id === appId
              ? "The ids match, so the token itself lacks rights — regenerate it in the Developer Portal."
              : `Fix ONE of the two secrets so they name the same application — most likely set DISCORD_APP_ID=${app.id}, ` +
                "or if the old gateway bot's app is the one in your server, use THAT app's bot token instead."),
        );
      } else {
        console.error("\nCould not identify the token's application (token may be invalid entirely).");
      }
    }
    throw new Error(`Discord command registration failed with status ${res.status}`);
  }

  const registered = (await res.json()) as Array<{ name: string }>;
  console.log(`Registered ${registered.length} commands: ${registered.map((c) => c.name).join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

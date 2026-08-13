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

// Discord application-command option types
// (https://discord.com/developers/docs/interactions/application-commands#application-command-object-application-command-option-type).
const OPTION_TYPE = {
  INTEGER: 4,
  USER: 6,
} as const;

interface CommandOption {
  name: string;
  description: string;
  type: number;
  required: boolean;
  autocomplete?: boolean;
}

interface CommandDef {
  name: string;
  description: string;
  options?: CommandOption[];
}

const COMMANDS: CommandDef[] = [
  { name: "balance", description: "Your wallet + lifetime record" },
  { name: "daily", description: "Claim your daily bonus (streak escalates!)" },
  {
    name: "tip",
    description: "Gift points to another member",
    options: [
      { name: "user", description: "who to tip", type: OPTION_TYPE.USER, required: true },
      { name: "amount", description: "how many points", type: OPTION_TYPE.INTEGER, required: true },
    ],
  },
  { name: "bets", description: "Your open and recent settled bets" },
  { name: "leaderboard", description: "Top balances + streaks" },
  { name: "exchange", description: "Link to the betting site + open markets" },
  { name: "store", description: "Browse the points store" },
  {
    name: "buy",
    description: "Buy a store item with your points",
    options: [
      {
        name: "item",
        description: "Pick an item (start typing to filter)",
        type: OPTION_TYPE.INTEGER,
        required: true,
        // Registration only — autocomplete requires handling a separate
        // APPLICATION_COMMAND_AUTOCOMPLETE interaction type, not ported by
        // this task (see the file header).
        autocomplete: false,
      },
    ],
  },
];

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
    body: JSON.stringify(COMMANDS),
  });

  console.log(`PUT guild commands -> ${res.status} ${res.statusText}`);
  if (!res.ok) {
    const body = await res.text();
    console.error(body);
    throw new Error(`Discord command registration failed with status ${res.status}`);
  }

  const registered = (await res.json()) as Array<{ name: string }>;
  console.log(`Registered ${registered.length} commands: ${registered.map((c) => c.name).join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

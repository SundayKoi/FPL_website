// The declarative slash-command list for the betting bot — the one source of
// truth for what Discord shows in the picker. Consumed by two registrars:
// scripts/register-discord-commands.ts (CI workflow, GitHub secrets) and
// admin-actions.ts's registerDiscordCommands (staff button, Vercel env).
// Names/descriptions/options were ported verbatim from the source gateway
// bot's decorators (see the script's header for the porting history).
//
// Deliberately NOT "server-only": the tsx script imports it, and it holds no
// secrets — it's the same array Discord republishes to every client anyway.

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

export interface CommandDef {
  name: string;
  description: string;
  options?: CommandOption[];
}

export const DISCORD_COMMANDS: CommandDef[] = [
  { name: "balance", description: "Your wallet + lifetime record" },
  { name: "daily", description: "Claim your daily bonus (streak escalates!)" },
  { name: "weekly", description: "Claim your weekly bonus (streak escalates!)" },
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
        // APPLICATION_COMMAND_AUTOCOMPLETE interaction type, which the
        // handlers don't implement.
        autocomplete: false,
      },
    ],
  },
];

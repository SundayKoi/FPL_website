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
  STRING: 3,
  INTEGER: 4,
  USER: 6,
} as const;

interface CommandOption {
  name: string;
  description: string;
  type: number;
  required: boolean;
  autocomplete?: boolean;
  /** Fixed value list Discord renders as a picker (string options only). */
  choices?: { name: string; value: string }[];
}

export interface CommandDef {
  name: string;
  description: string;
  options?: CommandOption[];
}

export const DISCORD_COMMANDS: CommandDef[] = [
  { name: "balance", description: "Your wallet + lifetime record" },
  {
    name: "rip",
    description: "Rip your free daily card pack (patrons get two)",
    options: [
      {
        name: "league",
        description: "Which league's packs (default premier)",
        type: OPTION_TYPE.STRING,
        required: false,
        choices: [
          { name: "Premier", value: "premier" },
          { name: "Academy", value: "academy" },
        ],
      },
      {
        // Free text rather than choices: the archived weeks grow every
        // Monday, and command registration is a CI run, not a cron. The
        // handler resolves "1"/"2"/a Monday date against the live archive
        // and answers with the menu when it can't.
        name: "week",
        description: "Edition to rip: a week number (1, 2, …) or its Monday (YYYY-MM-DD). Default: newest",
        type: OPTION_TYPE.STRING,
        required: false,
      },
    ],
  },
  {
    name: "flex",
    description: "Show off a card you own",
    options: [
      {
        // Autocompleted from the caller's own collection, so the picker only
        // ever offers players they can actually flex and nobody has to know
        // a display name to the character. Typing past the list still works:
        // part of a name is enough, and the handler answers an ambiguous
        // match with the names it found rather than picking one for you.
        name: "player",
        description: "who — pick from your collection, or type part of a name",
        type: OPTION_TYPE.STRING,
        required: true,
        autocomplete: true,
      },
      {
        // Which of your copies of that player. The list is every copy you
        // own of the player chosen above, best first, each named by what
        // makes it that copy (edition, parallel, ink, stamp). Left empty,
        // the best one goes — the picker exists for the day you would
        // rather show the matte you pulled first than the foil.
        name: "copy",
        description: "which copy — pick from the list (default: your best)",
        type: OPTION_TYPE.STRING,
        required: false,
        autocomplete: true,
      },
      {
        name: "league",
        description: "Which league's collection (default premier)",
        type: OPTION_TYPE.STRING,
        required: false,
        choices: [
          { name: "Premier", value: "premier" },
          { name: "Academy", value: "academy" },
        ],
      },
      {
        // Free text for /rip's reason: the archive grows every Monday and
        // registration is a CI run. Same resolver, so the two commands
        // accept the same words.
        name: "week",
        description: "an edition week: 1, 2, … or YYYY-MM-DD",
        type: OPTION_TYPE.STRING,
        required: false,
      },
    ],
  },
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
        // Registration only: the route does dispatch autocomplete now (see
        // autocompleteHandlers and /flex), but nothing registers one for
        // /buy, and a picker that never fills in is worse than none.
        autocomplete: false,
      },
    ],
  },
];

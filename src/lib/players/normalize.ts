// Shared player-name normalization for the free-agency data and the
// canonical player pool, so an alias only has to be added once and both
// sides keep matching the same way.

export const PLAYER_NAME_ALIASES: Record<string, string> = {
  "flyinq squirtle": "flying squirtle",
  "conguitos0": "conguitos",
  begfourmercy: "beg",
  "08 mitsu eclipse": "chime",
  // Riot rename, 2026-08: same player, same #ezpz tag, same discord.
  imperialarcher: "archêr",
};

/**
 * The base pipeline (NFKC, trim, strip "Captain:" prefix, drop the Riot
 * "#TAG", collapse whitespace, lowercase) without alias mapping applied.
 */
export function normalizeBasePlayerName(name: string): string {
  return name
    .normalize("NFKC")
    .trim()
    .replace(/^captain:\s*/i, "")
    .split("#")[0]
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

/** Canonical matching also follows the league's known player renames. */
export function normalizePlayerName(name: string): string {
  const normalized = normalizeBasePlayerName(name);
  return PLAYER_NAME_ALIASES[normalized] ?? normalized;
}

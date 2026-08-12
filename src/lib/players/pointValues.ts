import { PLAYER_SEASONS } from "./seasonData";

function normalizePlayerName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/^captain:\s*/i, "")
    .split("#")[0]
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

const currentPlayerPointValues = new Map(
  PLAYER_SEASONS["season-5"].flatMap((section) =>
    section.players.flatMap((player) => {
      const key = normalizePlayerName(player.name);
      return key ? ([[key, player.min] as const]) : [];
    })
  )
);

export function currentPlayerPointValue(displayName: string): number | null {
  const key = normalizePlayerName(displayName);
  return key ? currentPlayerPointValues.get(key) ?? null : null;
}

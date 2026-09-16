import { linkedAccountUrls } from "./linkedAccounts";
import { normalizeBasePlayerName } from "./normalize";

/** Riot IDs from a single-summoner OP.GG link or a multisearch URL. */
export function linkedAccountNames(url: string): string[] {
  try {
    const parsed = new URL(url);
    const multisearch = parsed.searchParams.get("summoners");
    if (multisearch) return multisearch.split(",").map((account) => account.trim()).filter(Boolean);
    const slug = decodeURIComponent(parsed.pathname.split("/").pop() ?? "");
    const separator = slug.lastIndexOf("-");
    return separator > 0 ? [`${slug.slice(0, separator)}#${slug.slice(separator + 1)}`] : [];
  } catch {
    return [];
  }
}

/** Roster label and linked accounts, before any feature-specific aliases. */
export function playerAccountNames(player: { displayName: string; opggUrl?: string | null }): string[] {
  return [
    player.displayName,
    ...linkedAccountUrls(player.displayName).flatMap(linkedAccountNames),
    ...(player.opggUrl ? linkedAccountNames(player.opggUrl) : []),
  ].filter(Boolean);
}

/** Exact account matching ignores name spacing but preserves the Riot tag. */
export function riotIdKey(name: string, tag: string): string {
  return `${normalizeBasePlayerName(name).replace(/\s+/g, "")}#${tag.trim().toLocaleLowerCase()}`;
}

export function riotIdKeys(names: readonly string[]): Set<string> {
  return new Set(names.flatMap((value) => {
    const separator = value.lastIndexOf("#");
    if (separator <= 0 || separator === value.length - 1) return [];
    return [riotIdKey(value.slice(0, separator), value.slice(separator + 1))];
  }));
}

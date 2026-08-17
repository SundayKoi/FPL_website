const DEFAULT_REGION = "na";

function dedupeAccounts(accounts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const account of accounts) {
    const trimmed = account.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function multiSearchUrl(accounts: string[], region = DEFAULT_REGION): string | null {
  const unique = dedupeAccounts(accounts);
  if (unique.length === 0) return null;

  const params = new URLSearchParams({ summoners: unique.join(",") });
  return `https://op.gg/lol/multisearch/${region}?${params.toString()}`;
}

function accountsFromOpggUrl(rawUrl: string): string[] {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return [];
  }

  if (!url.hostname.endsWith("op.gg")) return [];

  const multi = url.searchParams.get("summoners");
  if (multi) return multi.split(",");

  const parts = url.pathname.split("/").filter(Boolean);
  const summonersIndex = parts.indexOf("summoners");
  const encodedAccount = summonersIndex >= 0 ? parts[summonersIndex + 2] : null;
  if (!encodedAccount) return [];

  const account = decodeURIComponent(encodedAccount);
  const tagBreak = account.lastIndexOf("-");
  if (tagBreak <= 0 || tagBreak === account.length - 1) return [];
  return [`${account.slice(0, tagBreak)}#${account.slice(tagBreak + 1)}`];
}

function accountFromRiotId(rawName: string | null | undefined): string[] {
  const name = rawName?.trim();
  if (!name) return [];
  const hashIndex = name.lastIndexOf("#");
  if (hashIndex <= 0 || hashIndex === name.length - 1) return [];
  return [name];
}

export function opggMultiSearchUrlFromOpggUrls(
  urls: Array<string | null | undefined>,
  region = DEFAULT_REGION,
): string | null {
  return multiSearchUrl(urls.flatMap((url) => (url ? accountsFromOpggUrl(url) : [])), region);
}

export function opggMultiSearchUrlFromRiotIds(
  accounts: Array<{ game_name: string | null; tag_line: string | null }>,
  region = DEFAULT_REGION,
): string | null {
  return multiSearchUrl(
    accounts.flatMap((account) => {
      const gameName = account.game_name?.trim();
      const tagLine = account.tag_line?.trim();
      return gameName && tagLine ? [`${gameName}#${tagLine}`] : [];
    }),
    region,
  );
}

export function opggMultiSearchUrlFromRosterPlayers(
  players: Array<{
    displayName?: string | null;
    display_name?: string | null;
    opggUrl?: string | null;
    opgg_url?: string | null;
  }>,
  region = DEFAULT_REGION,
): string | null {
  return multiSearchUrl(
    players.flatMap((player) => {
      const opggUrl = player.opggUrl ?? player.opgg_url ?? null;
      const displayName = player.displayName ?? player.display_name ?? null;
      return [...(opggUrl ? accountsFromOpggUrl(opggUrl) : []), ...accountFromRiotId(displayName)];
    }),
    region,
  );
}

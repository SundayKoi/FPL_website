// Prefix and substring ranking for the site search palette.

export type SearchKind = "page" | "player" | "team";

export interface SearchItem {
  kind: SearchKind;
  label: string;
  href: string;
  /** Shown beside the label: the group, the league, the tag. */
  hint?: string;
  keywords?: string[];
}

/** Lowercase, no accents, one space between words. "Name#TAG" becomes
 *  "name tag" so a pasted Riot id matches the same way a typed name does. */
export function normalizeQuery(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[#_./-]+/g, " ")
    .replace(/[^\p{L}\p{N} ']+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface SearchEntry {
  item: SearchItem;
  label: string;
  words: string[];
  hintWords: string[];
  keywords: { text: string; words: string[] }[];
}

function scoreToken(token: string, entry: SearchEntry): number {
  if (entry.label === token) return 6;
  if (entry.label.startsWith(token)) return 4;
  if (entry.words.some((word) => word.startsWith(token))) return 3;
  if (entry.label.includes(token)) return 2;
  if (entry.hintWords.some((word) => word.startsWith(token))) return 1;
  for (const keyword of entry.keywords) {
    if (keyword.text === token || keyword.text.startsWith(token)) return 2;
    if (keyword.words.some((word) => word.startsWith(token))) return 1;
  }
  return 0;
}

/** Normalize the catalog once, then reuse it across keystrokes. */
export function createSearch(items: SearchItem[]): (query: string, limit?: number) => SearchItem[] {
  const entries: SearchEntry[] = items.map((item) => {
    const label = normalizeQuery(item.label);
    return {
      item,
      label,
      words: label.split(" "),
      hintWords: item.hint ? normalizeQuery(item.hint).split(" ") : [],
      keywords: (item.keywords ?? []).map((keyword) => {
        const text = normalizeQuery(keyword);
        return { text, words: text.split(" ") };
      }),
    };
  });
  return (query, limit = 10) => rankEntries(query, entries, limit);
}

/**
 * The best `limit` matches for a query. Every word of the query must match
 * somewhere on an item for it to show; a stronger match ranks higher; ties
 * go to the shorter label, then alphabetical, so "Stats" beats "Pack stats"
 * for "stats" without anybody having to rank them by hand.
 */
function rankEntries(query: string, entries: SearchEntry[], limit: number): SearchItem[] {
  const tokens = normalizeQuery(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return [];
  const scored: { item: SearchItem; score: number }[] = [];
  for (const entry of entries) {
    let score = 0;
    for (const token of tokens) {
      const s = scoreToken(token, entry);
      if (s === 0) {
        score = 0;
        break;
      }
      score += s;
    }
    if (score > 0) scored.push({ item: entry.item, score });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.item.label.length - b.item.label.length ||
      a.item.label.localeCompare(b.item.label),
  );
  return scored.slice(0, limit).map((entry) => entry.item);
}

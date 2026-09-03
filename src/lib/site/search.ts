// Ranking for the search palette. Pure: a query and a list in, the best
// matches out, so what the palette shows for "vault" is testable without a
// browser.
//
// This is prefix-and-substring matching, not fuzzy matching. The index is a
// few hundred names and the person typing knows roughly what they are after;
// "did you mean" on a four-letter summoner name is noise, not help.

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

function scoreToken(token: string, item: SearchItem): number {
  const label = normalizeQuery(item.label);
  if (label === token) return 6;
  if (label.startsWith(token)) return 4;
  if (label.split(" ").some((word) => word.startsWith(token))) return 3;
  if (label.includes(token)) return 2;
  const hint = item.hint ? normalizeQuery(item.hint) : "";
  if (hint && hint.split(" ").some((word) => word.startsWith(token))) return 1;
  for (const keyword of item.keywords ?? []) {
    const normalized = normalizeQuery(keyword);
    if (normalized === token || normalized.startsWith(token)) return 2;
    if (normalized.split(" ").some((word) => word.startsWith(token))) return 1;
  }
  return 0;
}

/**
 * The best `limit` matches for a query. Every word of the query must match
 * somewhere on an item for it to show; a stronger match ranks higher; ties
 * go to the shorter label, then alphabetical, so "Stats" beats "Pack stats"
 * for "stats" without anybody having to rank them by hand.
 */
export function rankSearch(query: string, items: SearchItem[], limit = 10): SearchItem[] {
  const tokens = normalizeQuery(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return [];
  const scored: { item: SearchItem; score: number }[] = [];
  for (const item of items) {
    let score = 0;
    for (const token of tokens) {
      const s = scoreToken(token, item);
      if (s === 0) {
        score = 0;
        break;
      }
      score += s;
    }
    if (score > 0) scored.push({ item, score });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.item.label.length - b.item.label.length ||
      a.item.label.localeCompare(b.item.label),
  );
  return scored.slice(0, limit).map((entry) => entry.item);
}

/** The weekly homepage write-up: types, selection, and the text clean-up that
 *  keeps generated copy from reading like generated copy. */

export interface HomepageBrief {
  id: string;
  season: string;
  week: number | null;
  recap: string | null;
  preview: string | null;
  players_note: string | null;
  teams_note: string | null;
  league_notes: string | null;
  model: string | null;
  published: boolean;
  generated_at: string;
}

/** The brief the homepage should show: newest published one. Unpublishing the
 *  latest therefore falls back to the week before rather than blanking. */
export function activeBrief(briefs: HomepageBrief[]): HomepageBrief | null {
  const published = briefs
    .filter((b) => b.published)
    .sort((a, b) => b.generated_at.localeCompare(a.generated_at));
  return published[0] ?? null;
}

/** Phrasing that reads as machine-written. The prompt asks the model to avoid
 *  these; this is the backstop for when it does it anyway. Order matters:
 *  longer phrases first so a short one does not eat part of a long one. */
const TELLS: [RegExp, string][] = [
  [/\bit'?s worth noting that\b/gi, ""],
  [/\bit'?s important to (?:note|remember) that\b/gi, ""],
  [/\bwhen it comes to\b/gi, "for"],
  [/\bin the world of\b/gi, "in"],
  [/\bin the realm of\b/gi, "in"],
  [/\ba testament to\b/gi, "proof of"],
  [/\bserves as a reminder\b/gi, "is a reminder"],
  [/\bstands as\b/gi, "is"],
  [/\bboasts\b/gi, "has"],
  [/\bdelve into\b/gi, "dig into"],
  [/\bnavigate the landscape\b/gi, "handle it"],
  [/\bgame[- ]changer\b/gi, "turning point"],
  [/\bunleash(?:ed|es)?\b/gi, "let loose"],
  [/\belevate(?:d|s)?\b/gi, "lift"],
  [/\bat the end of the day\b/gi, ""],
  [/\bneedless to say\b/gi, ""],
  [/\bone thing is clear\b/gi, ""],
];

/**
 * Strip the giveaways from generated copy.
 *
 * Em and en dashes are the loudest one, so they are replaced structurally
 * rather than deleted: a spaced dash becomes a comma, an unspaced dash between
 * words becomes a plain hyphen (which is what a compound word wanted anyway).
 * Number ranges like 2–0 keep a hyphen so scorelines survive.
 */
export function stripAiTells(text: string): string {
  let out = text;

  // 2–0 and 10–15 stay as ranges.
  out = out.replace(/(\d)\s*[—–]\s*(\d)/g, "$1-$2");
  // " — " joining clauses reads as a comma.
  out = out.replace(/\s+[—–]\s+/g, ", ");
  // Anything left is inside or beside a word.
  out = out.replace(/[—–]/g, "-");

  for (const [pattern, replacement] of TELLS) {
    out = out.replace(pattern, replacement);
  }

  out = out
    // Tidy up what removals left behind.
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/^[\s,]+/gm, "")
    .trim();

  // A replacement can land at the start of a sentence and arrive lowercase
  // ("When it comes to" -> "for"), so restore sentence case afterwards.
  return out.replace(/(^|[.!?]\s+)([a-z])/g, (_m, lead: string, letter: string) =>
    lead + letter.toUpperCase()
  );
}

/** Apply the clean-up to every section of a brief. */
export function cleanBrief<T extends Record<string, unknown>>(sections: T): T {
  const out: Record<string, unknown> = { ...sections };
  for (const [key, value] of Object.entries(sections)) {
    if (typeof value === "string") out[key] = stripAiTells(value);
  }
  return out as T;
}

const BLOCKED_TERMS = [
  "nigger",
  "nigga",
  "faggot",
  "tranny",
  "kike",
  "chink",
  "spic",
  "gook",
  "wetback",
  "retard",
];

const BLOCKED_TERM_PATTERN = new RegExp(`\\b(?:${BLOCKED_TERMS.sort((a, b) => b.length - a.length).join("|")})\\b`, "gi");

export function sanitizeTweetText(text: string) {
  return text.replace(BLOCKED_TERM_PATTERN, (term) => "*".repeat(term.length));
}

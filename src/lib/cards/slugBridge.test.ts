// The card slug is written twice — once in TypeScript (cardSlug, below) and
// once in SQL (public.card_slug, added by
// supabase/migrations/20260910000001_rename_player.sql so rename_player can
// re-slug a player's cards).
//
// A slug written twice is a slug that drifts, and this one drifting does not
// throw: it quietly splits a player in two, because the url, the inventory
// rows and the print archive are all keyed on it. So the two must be pinned
// to the same answers.
//
// The pgTAP suite owns the case table. This test reads those cases straight
// out of the .sql file and asserts the TypeScript agrees, which means adding
// a case in one place covers both — and changing one implementation without
// the other fails here.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cardSlug } from "./build";

const PGTAP = path.join(process.cwd(), "supabase/tests/0082_rename_player_test.sql");

/** The `select is(public.card_slug('X', 'Y'), 'z', '…')` lines between the
 *  SLUG_CASES markers, as {name, tag, slug}. */
function casesFromPgTap(): { name: string; tag: string; slug: string }[] {
  const sql = readFileSync(PGTAP, "utf8");
  const start = sql.indexOf("-- SLUG_CASES_BEGIN");
  const end = sql.indexOf("-- SLUG_CASES_END");
  expect(start, "SLUG_CASES_BEGIN marker missing from the pgTAP suite").toBeGreaterThan(-1);
  expect(end, "SLUG_CASES_END marker missing from the pgTAP suite").toBeGreaterThan(start);

  const cases: { name: string; tag: string; slug: string }[] = [];
  const line = /public\.card_slug\('((?:[^']|'')*)',\s*'((?:[^']|'')*)'\),\s*'((?:[^']|'')*)'/g;
  for (const match of sql.slice(start, end).matchAll(line)) {
    // '' is SQL's escape for a literal apostrophe.
    const unquote = (s: string) => s.replace(/''/g, "'");
    cases.push({ name: unquote(match[1]), tag: unquote(match[2]), slug: unquote(match[3]) });
  }
  return cases;
}

describe("the card slug means the same thing in TypeScript and in SQL", () => {
  const cases = casesFromPgTap();

  it("finds the shared case table", () => {
    // If the parse silently returned nothing, every assertion below would
    // vacuously pass and the bridge would be decorative.
    expect(cases.length).toBeGreaterThanOrEqual(5);
  });

  it.each(cases)("cardSlug($name, $tag) === $slug", ({ name, tag, slug }) => {
    expect(cardSlug(name, tag)).toBe(slug);
  });
});

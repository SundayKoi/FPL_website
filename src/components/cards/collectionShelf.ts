// The collection shelf's rules, without the React: how copies sort, what
// the finder matches, what each variant filter keeps, which copies count as
// the same print, and which one goes on display. CollectionGrid.tsx draws
// the shelf from these.

import { printRunKey } from "@/lib/packs/printRuns";
import type { InventoryRow } from "@/lib/packs/queries";
import { ALT_SKIN_CHANCE, DEFAULT_FOIL_TYPE, ECLIPSE_FOIL_TYPE, FOIL_CHANCE, SIGNED_CHANCE } from "@/lib/packs/config";

export type VariantFilter = "all" | "foil" | "signed" | "alt";

/** How the shelf can be ordered. "best" is the showcase order the shelf
 *  always had — Eclipse, ink, overall, foil. The rest are the questions a
 *  collector actually asks of a big shelf: is it here (name), what did
 *  last week's packs give me (newest / week), what is my top end (rating). */
export type ShelfSort = "best" | "name" | "newest" | "rating" | "week";

export const SHELF_SORTS: { key: ShelfSort; label: string }[] = [
  { key: "best", label: "Best first" },
  { key: "name", label: "Name A–Z" },
  { key: "newest", label: "Newest pull" },
  { key: "rating", label: "Highest rating" },
  { key: "week", label: "Newest edition" },
];

/** A comparator for the chosen order. Ties fall back to the showcase order
 *  so two same-named or same-rated copies still line up by quality. */
export function copyOrder(sort: ShelfSort): (a: InventoryRow, b: InventoryRow) => number {
  switch (sort) {
    case "name":
      return (a, b) => a.playerName.localeCompare(b.playerName) || showcaseOrder(a, b);
    case "newest":
      return (a, b) => b.acquiredAt.localeCompare(a.acquiredAt) || b.id - a.id;
    case "rating":
      return (a, b) => b.overall - a.overall || showcaseOrder(a, b);
    case "week":
      return (a, b) => b.editionWeek.localeCompare(a.editionWeek) || showcaseOrder(a, b);
    default:
      return showcaseOrder;
  }
}

/** Name and week, the two things typed or picked into the finder. The
 *  name match is a substring, case-blind — nobody types a tag. */
export function matchesFinder(row: InventoryRow, query: string, week: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle && !row.playerName.toLowerCase().includes(needle)) return false;
  if (week && row.editionWeek !== week) return false;
  return true;
}

export const FILTERS: { key: VariantFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "foil", label: "✦ Foils" },
  { key: "signed", label: "✍ Signed" },
  { key: "alt", label: "Alt arts" },
];

/** Each empty state names the odds, because "you have none" and "these are
 *  hard to get" are the same sentence in a pack economy. Read off the
 *  gates that actually roll, so a balance pass can never leave a stale
 *  number on the shelf. */
export const EMPTY_COPY: Record<Exclude<VariantFilter, "all">, string> = {
  foil: `No foils yet — they're a ${Math.round(FOIL_CHANCE * 100)}% pull.`,
  signed: `No signed cards yet — 1-in-${Math.round(1 / SIGNED_CHANCE)} pulls.`,
  alt: `No alternate prints yet — ${Math.round(ALT_SKIN_CHANCE * 100)}% of pulls come in an alternate skin.`,
};

/** The skin this copy printed in; 0 is the champion's base splash. Read off
 *  the frozen json rather than a flat column — the roll is only recorded
 *  there (src/lib/packs/skins.ts). */
export function skinOf(row: InventoryRow): number {
  return row.card?.artSkin ?? 0;
}

export const MATCHES: Record<Exclude<VariantFilter, "all">, (row: InventoryRow) => boolean> = {
  foil: (row) => row.foil,
  signed: (row) => row.signed,
  alt: (row) => skinOf(row) > 0,
};

/** Which parallel a copy wears, for grouping. A matte copy is "", and so
 *  is a pre-parallels foil that was backfilled to Prisma: they are the base
 *  look. Anything else is its own print — a Cracked Ice is not a Prisma. */
export function parallelOf(row: InventoryRow): string {
  if (!row.foil) return "";
  return row.foilType && row.foilType !== DEFAULT_FOIL_TYPE ? row.foilType : "";
}

/** The one copy that outranks every rule below it. */
export function isEclipse(row: InventoryRow): boolean {
  return row.foilType === ECLIPSE_FOIL_TYPE;
}

/** What makes two copies the same *print*: the cosmetic rolls. Two copies
 *  of a player from different weeks at different ratings are still the same
 *  thing to look at if they match.
 *
 *  The parallel is part of the key. The first cut keyed on foil-or-not, and
 *  the first Eclipse ever pulled — a signed foil, technically — stacked
 *  behind a signed Prisma of the same player and showed as "×2". A
 *  one-of-one that reads as a duplicate is the exact opposite of what it
 *  is, and the same is true, more quietly, of a Cracked Ice filed under a
 *  Prisma. */
export function printKey(row: InventoryRow): string {
  return `${skinOf(row)}|${row.foil ? "f" : ""}|${row.signed ? "s" : ""}|${parallelOf(row)}`;
}

/** The copy to put on the shelf: an Eclipse over everything, because there
 *  is nothing rarer and nothing else that can happen to a pull; then an
 *  autographed copy — the ink is the rarest ordinary thing and nobody
 *  shelves a plain copy over a signed one — then highest overall, foil
 *  winning a tie (identical ratings are the same card, and the foil is the
 *  nicer print). */
export function betterCopy(a: InventoryRow, b: InventoryRow): InventoryRow {
  if (isEclipse(a) !== isEclipse(b)) return isEclipse(b) ? b : a;
  if (a.signed !== b.signed) return b.signed ? b : a;
  if (b.overall !== a.overall) return b.overall > a.overall ? b : a;
  return b.foil && !a.foil ? b : a;
}

/** Showcase order: Eclipse, then the ink, then rating. Same rule the shelf
 *  ranks a player's copies by, so a strip and a filtered wall agree. */
export function showcaseOrder(a: InventoryRow, b: InventoryRow): number {
  return (
    Number(isEclipse(b)) - Number(isEclipse(a)) ||
    Number(b.signed) - Number(a.signed) ||
    b.overall - a.overall ||
    a.id - b.id
  );
}

/**
 * "#7 of 43" for one copy, or null when either half is unknown.
 *
 * Both halves have to be there: a serial with no run size is a number
 * nobody can read, and a run size with no serial belongs to a different
 * copy. The map is keyed by print (week + slug), not by copy, because one
 * print's total is the same for every copy of it — see fetchPrintRuns.
 */
export function printOf(
  row: InventoryRow,
  printRuns?: ReadonlyMap<string, number>,
): { number: number; of: number; editionWeek: string } | null {
  if (row.printNumber == null) return null;
  const minted = printRuns?.get(printRunKey(row.editionWeek, row.slug));
  if (!minted) return null;
  return { number: row.printNumber, of: minted, editionWeek: row.editionWeek };
}
/** Build the collapsed shelf once per finder/sort change, keeping frozen copies intact. */
export function shelfEntries(rows: InventoryRow[], sort: ShelfSort, printRuns?: ReadonlyMap<string, number>) {
  const compare = copyOrder(sort);
  const groups = new Map<string, InventoryRow[]>();
  for (const row of rows) {
    const copies = groups.get(row.slug) ?? [];
    copies.push(row);
    groups.set(row.slug, copies);
  }

  return [...groups.values()]
    .map((copies) => {
      // Distinct prints, one representative each: the strip is about what a
      // copy looks like, and two identical prints look identical.
      const byPrint = new Map<string, InventoryRow[]>();
      for (const copy of copies) {
        const key = printKey(copy);
        const prints = byPrint.get(key);
        if (prints) prints.push(copy);
        else byPrint.set(key, [copy]);
      }
      return {
        best: copies.reduce(betterCopy),
        count: copies.length,
        // The Eclipse is counted apart from the foils: a ✦ beside a ◐ would
        // say "two foils" about a stack that holds one foil and one thing
        // there is exactly one of in the world.
        eclipses: copies.filter(isEclipse).length,
        foils: copies.filter((copy) => copy.foil && !isEclipse(copy)).length,
        signatures: copies.filter((copy) => copy.signed).length,
        // Chronological, so the chips read as a print history.
        editions: [...new Set(copies.map((copy) => copy.editionWeek))].sort(),
        prints: [...byPrint.values()]
          .map((prints) => ({ copy: prints.reduce(betterCopy), count: prints.length }))
          .sort((a, b) => showcaseOrder(a.copy, b.copy)),
        // What the dust drawer needs: the flat fields it labels and prices a
        // copy by, plus the frozen print it shows you before you destroy it.
        // No extra payload — this json is already on the client.
        copies: copies
          .map((copy) => ({
            id: copy.id,
            tier: copy.tier,
            foil: copy.foil,
            // The parallel is what tells the drawer a copy cannot be dusted
            // at all (an Eclipse), and what prices a Cracked Ice above a
            // Prisma — the same field the server reads for both.
            foilType: copy.foilType,
            signed: copy.signed,
            editionWeek: copy.editionWeek,
            card: copy.card,
            // Resolved here rather than in the drawer: the drawer's copies
            // carry no slug, and the counter map is keyed by print.
            printNumber: copy.printNumber,
            printRun: printRuns?.get(printRunKey(copy.editionWeek, copy.slug)) ?? null,
          }))
          .sort((a, b) => a.editionWeek.localeCompare(b.editionWeek) || a.id - b.id),
      };
    })
    .sort((a, b) => compare(a.best, b.best) || a.best.playerName.localeCompare(b.best.playerName));
}

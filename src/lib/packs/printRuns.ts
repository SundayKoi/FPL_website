// The print-run key, on its own.
//
// It lives apart from packs/queries.ts for a reason that is easy to trip
// over and hard to see: CollectionGrid is a client component, and the first
// cut imported this helper from queries.ts — which imports cards/queries,
// which imports stats/weekly, which imports the server Supabase client,
// which imports next/headers. Turbopack then refused to build the browser
// bundle. A type-only import from queries.ts is erased and safe; a runtime
// import of anything from it is not. Pure helpers that both sides need go
// here, where the import graph is empty.

/** A print's key in the map fetchPrintRuns returns. Exported so a caller
 *  building a lookup and a caller reading one can't disagree about the
 *  separator — `week|slug`, and neither half can contain a pipe. */
export function printRunKey(editionWeek: string, slug: string): string {
  return `${editionWeek}|${slug}`;
}

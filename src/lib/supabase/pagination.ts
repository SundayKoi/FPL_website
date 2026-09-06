/** Read a complete PostgREST result using a fresh, totally ordered query
 * per page. Fail rather than return a plausible but truncated dataset. */
export async function fetchAllPages<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
  { pageSize = 1000, maxPages = 100 } = {},
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const { data, error } = await buildPage(from, from + pageSize - 1);
    if (error) throw error;
    const batch = (data as T[]) ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
  throw new Error(`Query exceeded ${maxPages} pages; refusing to return partial data`);
}

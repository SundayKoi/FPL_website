/**
 * scripts/load-stats.ts — bulk-loads `scripts/data/raw_stats.json` into
 * `public.raw_stats` via the PostgREST bulk-insert endpoint, in batches of
 * 500, using `Prefer: resolution=ignore-duplicates` so re-running the loader
 * against data that's already present is a no-op (relies on the unique index
 * on (match_id, summoner_name) created by the migration).
 *
 * Same resolveConfig pattern as scripts/seed-demo.ts: env override
 * (SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY),
 * else `npx supabase status -o json`.
 *
 * Run with: npx tsx scripts/load-stats.ts [--truncate]
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const BATCH_SIZE = 500;
const DATA_PATH = path.resolve(__dirname, "data", "raw_stats.json");

type SqlValue = string | number | boolean | null;
type Row = Record<string, SqlValue>;

function resolveConfig(): { url: string; serviceKey: string } {
  const envUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const envKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (envUrl && envKey) return { url: envUrl, serviceKey: envKey };
  const status = JSON.parse(execSync("npx supabase status -o json", { encoding: "utf8" }));
  const url = envUrl ?? status.API_URL;
  const serviceKey = envKey ?? status.SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Could not resolve Supabase URL / service key. Is `npx supabase start` running?");
  }
  return { url, serviceKey };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * `Prefer: resolution=ignore-duplicates` (ON CONFLICT DO NOTHING) only guards
 * against rows that already exist in the table — Postgres still errors on two
 * rows within the *same* multi-row INSERT sharing a conflicting key. The
 * source data has a handful of exact-duplicate (match_id, summoner_name)
 * rows, so dedupe within the batch here (keep the last occurrence) before
 * every POST; the DB-side ignore-duplicates still handles reruns.
 */
function dedupeByKey(rows: Row[]): { deduped: Row[]; duplicatesInSource: number } {
  const byKey = new Map<string, Row>();
  for (const row of rows) {
    const key = `${row.match_id}|${row.summoner_name}`;
    byKey.set(key, row);
  }
  return { deduped: [...byKey.values()], duplicatesInSource: rows.length - byKey.size };
}

async function truncateTable(url: string, serviceKey: string): Promise<void> {
  // No generic truncate RPC exists; delete all rows via REST instead.
  const del = await fetch(`${url}/rest/v1/raw_stats?id=gte.0`, {
    method: "DELETE",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  if (!del.ok) {
    const body = await del.text();
    throw new Error(`Truncate failed: ${del.status} ${body}`);
  }
  console.log("Truncated public.raw_stats.");
}

async function postBatch(url: string, serviceKey: string, batch: Row[]): Promise<number> {
  // `resolution=ignore-duplicates` (ON CONFLICT (...) DO NOTHING) requires
  // PostgREST to be told which conflict target to use via `on_conflict` —
  // it does not infer this from the table's unique index on its own.
  const res = await fetch(`${url}/rest/v1/raw_stats?on_conflict=match_id,summoner_name`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=representation",
    },
    body: JSON.stringify(batch),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Batch insert failed: ${res.status} ${body}`);
  }
  const inserted = (await res.json()) as unknown[];
  return inserted.length;
}

async function main() {
  const truncate = process.argv.includes("--truncate");
  const { url, serviceKey } = resolveConfig();

  if (truncate) {
    await truncateTable(url, serviceKey);
  }

  const rawRows = JSON.parse(readFileSync(DATA_PATH, "utf8")) as Row[];
  console.log(`Loaded ${rawRows.length} rows from ${DATA_PATH}.`);

  const { deduped: rows, duplicatesInSource } = dedupeByKey(rawRows);
  if (duplicatesInSource > 0) {
    console.log(
      `Deduped ${duplicatesInSource} row(s) sharing a (match_id, summoner_name) key with another row in the source file (kept the last occurrence).`
    );
  }

  const batches = chunk(rows, BATCH_SIZE);
  let insertedTotal = 0;
  let skippedTotal = 0;

  for (const [idx, batch] of batches.entries()) {
    const insertedCount = await postBatch(url, serviceKey, batch);
    const skippedCount = batch.length - insertedCount;
    insertedTotal += insertedCount;
    skippedTotal += skippedCount;
    console.log(
      `Batch ${idx + 1}/${batches.length}: ${insertedCount} inserted, ${skippedCount} skipped (already present).`
    );
  }

  console.log(`Done. Inserted ${insertedTotal}, skipped ${skippedTotal} (of ${rows.length} total rows).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

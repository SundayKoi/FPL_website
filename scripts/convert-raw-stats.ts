/**
 * scripts/convert-raw-stats.ts — one-time conversion of the root `raw_stats.sql`
 * dump (CREATE TABLE + 68 `insert into ... values (...), (...), ...;` statements)
 * into `scripts/data/raw_stats.json`: an array of row objects keyed by column name.
 *
 * Parses the column list out of the first `insert into public.raw_stats (...)`
 * header, then tokenizes every parenthesized tuple with a real character-level
 * scanner (handles quoted strings incl. `''` escaping, `null`/`NULL`, booleans,
 * and numbers) rather than a naive split-on-comma.
 *
 * Run with: npx tsx scripts/convert-raw-stats.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const EXPECTED_ROWS = 3360;
const EXPECTED_COLS = 137;

const ROOT_SQL_PATH = path.resolve(__dirname, "..", "raw_stats.sql");
const OUT_JSON_PATH = path.resolve(__dirname, "data", "raw_stats.json");

type SqlValue = string | number | boolean | null;
type Row = Record<string, SqlValue>;

/** Extract the column list from the first `insert into public.raw_stats (...) values` header. */
function extractColumns(sql: string): string[] {
  const match = sql.match(/insert into public\.raw_stats\s*\(([^)]*)\)\s*values/i);
  if (!match) {
    throw new Error("Could not find `insert into public.raw_stats (...) values` header in raw_stats.sql");
  }
  return match[1].split(",").map((c) => c.trim());
}

/**
 * Tokenize a single value starting at `i` (just past `(` or `,`). Returns the
 * parsed value and the index of the character immediately after the value
 * (i.e. pointing at the next `,` or `)`).
 */
function parseValue(text: string, start: number): { value: SqlValue; next: number } {
  let i = start;
  // Skip leading whitespace.
  while (i < text.length && /\s/.test(text[i])) i++;

  if (text[i] === "'") {
    // Quoted string literal; '' is an escaped single quote.
    let out = "";
    i++; // skip opening quote
    for (;;) {
      if (i >= text.length) throw new Error(`Unterminated string literal starting at index ${start}`);
      const ch = text[i];
      if (ch === "'") {
        if (text[i + 1] === "'") {
          out += "'";
          i += 2;
          continue;
        }
        i++; // skip closing quote
        break;
      }
      out += ch;
      i++;
    }
    return { value: out, next: i };
  }

  // Unquoted token: read until the next top-level `,` or `)`.
  let j = i;
  while (j < text.length && text[j] !== "," && text[j] !== ")") j++;
  const token = text.slice(i, j).trim();
  return { value: parseUnquotedToken(token), next: j };
}

function parseUnquotedToken(token: string): SqlValue {
  const lower = token.toLowerCase();
  if (lower === "null") return null;
  if (lower === "true") return true;
  if (lower === "false") return false;
  if (token === "") throw new Error("Empty unquoted token encountered");
  const num = Number(token);
  if (Number.isNaN(num)) throw new Error(`Unrecognized unquoted token: "${token}"`);
  return num;
}

/** Parse one `(...)` tuple starting at the `(` at index `openParen`. Returns values + index after the closing `)`. */
function parseTuple(text: string, openParen: number): { values: SqlValue[]; next: number } {
  if (text[openParen] !== "(") throw new Error(`Expected "(" at index ${openParen}`);
  const values: SqlValue[] = [];
  let i = openParen + 1;
  for (;;) {
    const { value, next } = parseValue(text, i);
    values.push(value);
    i = next;
    while (i < text.length && /\s/.test(text[i])) i++;
    if (text[i] === ",") {
      i++;
      continue;
    }
    if (text[i] === ")") {
      i++;
      break;
    }
    throw new Error(`Expected "," or ")" at index ${i}, got "${text[i]}"`);
  }
  return { values, next: i };
}

/** Extract every `(...)` row tuple from every `insert into public.raw_stats (...) values ...;` statement. */
function extractRows(sql: string, columns: string[]): Row[] {
  const rows: Row[] = [];
  const headerRe = /insert into public\.raw_stats\s*\([^)]*\)\s*values/gi;
  let headerMatch: RegExpExecArray | null;
  while ((headerMatch = headerRe.exec(sql)) !== null) {
    let i = headerMatch.index + headerMatch[0].length;
    for (;;) {
      while (i < sql.length && /\s/.test(sql[i])) i++;
      if (sql[i] !== "(") break; // no more tuples in this statement
      const { values, next } = parseTuple(sql, i);
      if (values.length !== columns.length) {
        throw new Error(
          `Row starting at index ${i} has ${values.length} values, expected ${columns.length} (columns: ${columns.length})`
        );
      }
      const row: Row = {};
      columns.forEach((col, idx) => {
        row[col] = values[idx];
      });
      rows.push(row);
      i = next;
      while (i < sql.length && /\s/.test(sql[i])) i++;
      if (sql[i] === ",") {
        i++;
        continue;
      }
      if (sql[i] === ";") {
        i++;
        break;
      }
      throw new Error(`Expected "," or ";" after tuple ending at index ${i}, got "${sql[i]}"`);
    }
    headerRe.lastIndex = i;
  }
  return rows;
}

function main() {
  const sql = readFileSync(ROOT_SQL_PATH, "utf8");
  const columns = extractColumns(sql);
  console.log(`Extracted ${columns.length} columns from insert header.`);
  if (columns.length !== EXPECTED_COLS) {
    throw new Error(`Expected ${EXPECTED_COLS} columns, found ${columns.length}`);
  }

  const rows = extractRows(sql, columns);
  console.log(`Extracted ${rows.length} rows.`);
  if (rows.length !== EXPECTED_ROWS) {
    throw new Error(`Expected ${EXPECTED_ROWS} rows, found ${rows.length}`);
  }

  // Sanity-check every row has exactly the expected column count.
  for (const [idx, row] of rows.entries()) {
    const keys = Object.keys(row).length;
    if (keys !== EXPECTED_COLS) {
      throw new Error(`Row ${idx} has ${keys} keys, expected ${EXPECTED_COLS}`);
    }
  }

  writeFileSync(OUT_JSON_PATH, JSON.stringify(rows, null, 2) + "\n", "utf8");
  console.log(`Wrote ${rows.length} rows x ${columns.length} cols -> ${OUT_JSON_PATH}`);
}

main();

/**
 * Compares the bundled champion roster against live Data Dragon.
 *
 * The drafter already reads the live roster at runtime, so new champions
 * appear there on their own. Two things do NOT follow automatically:
 *
 *  1. CHAMPION_ROLES. Data Dragon publishes `tags` (Mage, Fighter,
 *     Assassin) — champion CLASSES, not lane positions. There is no
 *     first-party field saying which lane a champion plays, so a champion
 *     missing from the role map falls back to all five and shows up under
 *     every filter in the drafter. Only a person can fill that in.
 *
 *  2. CHAMPION_NAMES. The bundled list is what the offline fallback uses,
 *     and what championDisplayName resolves Riot's internal names against.
 *
 * Run: npx tsx scripts/sync-champions.ts          (report only)
 *      npx tsx scripts/sync-champions.ts --write  (apply what is safe)
 *
 * --write adds the missing names and bumps the pinned version. It
 * deliberately does NOT invent roles, so the champions test fails until
 * someone says where the new champions play. That failure is the point:
 * a champion with no role is worse than a champion that is absent, because
 * it claims to play everywhere.
 *
 * Needs plain outbound HTTPS to ddragon.leagueoflegends.com. No secrets.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { CHAMPIONS, DDRAGON_VERSION } from "../src/lib/match-draft/champions";

const SOURCE = "src/lib/match-draft/champions.ts";
// Overridable so the script can be exercised against a stub roster; every
// real run leaves it unset and talks to Riot.
const BASE = process.env.DDRAGON_BASE ?? "https://ddragon.leagueoflegends.com";

interface DataDragonChampion {
  id: string;
  name: string;
}

/** Fetch + parse with a legible failure. A blocked proxy answers with an
 *  HTML body, and letting that hit .json() reports "Unexpected token 'H'",
 *  which tells whoever ran this nothing about what went wrong. */
async function getJson<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`Could not reach ${url} — ${error instanceof Error ? error.message : error}`);
  }
  if (!response.ok) throw new Error(`${url} answered ${response.status} ${response.statusText}`);
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${url} did not return JSON (a proxy or captive portal?): ${text.slice(0, 120)}`);
  }
}

async function fetchRoster(): Promise<{ version: string; champions: DataDragonChampion[] }> {
  const versions = await getJson<string[]>(`${BASE}/api/versions.json`);
  const version = versions[0];
  if (!version) throw new Error("versions.json returned no versions");
  const body = await getJson<{ data?: Record<string, { id?: string; name?: string }> }>(
    `${BASE}/cdn/${version}/data/en_US/champion.json`,
  );
  const champions = Object.values(body.data ?? {})
    .filter((entry): entry is DataDragonChampion => Boolean(entry.id && entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (champions.length === 0) throw new Error("champion.json returned no champions");
  return { version, champions };
}

function insertNames(source: string, names: string[]): string {
  const marker = "const CHAMPION_NAMES = [";
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Could not find CHAMPION_NAMES in ${SOURCE}`);
  const end = source.indexOf("]", start);
  const block = source.slice(start + marker.length, end);
  const existing = [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  // Rebuilt sorted rather than appended: the list is alphabetical, and a
  // new champion tacked on the end makes the next diff unreadable.
  const merged = [...new Set([...existing, ...names])].sort((a, b) => a.localeCompare(b));
  const rebuilt = merged.map((name) => `  ${JSON.stringify(name)},`).join("\n");
  return `${source.slice(0, start + marker.length)}\n${rebuilt}\n${source.slice(end)}`;
}

/** `--out <path>`: the missing champions as JSON, so a later CI step can
 *  act on the diff without re-deriving it by scraping this log. */
function outPath(): string | null {
  const index = process.argv.indexOf("--out");
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function main(): Promise<void> {
  const write = process.argv.includes("--write");
  const { version, champions } = await fetchRoster();

  const bundled = new Set(CHAMPIONS.map((champion) => champion.name));
  const live = new Set(champions.map((champion) => champion.name));
  const missing = champions.filter((champion) => !bundled.has(champion.name));
  const stale = [...bundled].filter((name) => !live.has(name));
  // A display name whose id is not just the name with punctuation stripped
  // needs a DATA_DRAGON_IDS entry, or its art 404s.
  const needsAlias = missing.filter((c) => c.id !== c.name.replace(/[^A-Za-z0-9]/g, ""));

  console.log(`Data Dragon latest: ${version}`);
  console.log(`Pinned in ${SOURCE}: ${DDRAGON_VERSION}${version === DDRAGON_VERSION ? "" : "  <- out of date"}`);
  console.log(`Bundled ${bundled.size} champions, live roster has ${live.size}.\n`);

  if (missing.length === 0) {
    console.log("No missing champions.");
  } else {
    console.log(`Missing from the bundled roster (${missing.length}):`);
    for (const champion of missing) console.log(`  ${champion.name}  (id: ${champion.id})`);
    console.log("\nEach one needs a CHAMPION_ROLES entry — Data Dragon does not carry lane");
    console.log("positions, so this is the one part nothing can fetch. Paste these in as:");
    for (const champion of missing) console.log(`  ${JSON.stringify(champion.name)}: ["mid"],   // <- real roles here`);
  }

  if (needsAlias.length > 0) {
    console.log(`\nThese also need a DATA_DRAGON_IDS entry or their art will 404:`);
    for (const champion of needsAlias) console.log(`  ${JSON.stringify(champion.name)}: ${JSON.stringify(champion.id)},`);
  }

  if (stale.length > 0) {
    console.log(`\nBundled but not in the live roster (${stale.length}): ${stale.join(", ")}`);
    console.log("Left alone — a champion Riot renamed still needs to resolve for old games.");
  }

  const out = outPath();
  if (out) {
    writeFileSync(out, JSON.stringify({ version, missing, needsAlias, stale }, null, 2));
    console.log(`\nWrote the diff to ${out}.`);
  }

  if (!write) {
    console.log("\nReport only. Re-run with --write to add the names and bump the version.");
    return;
  }

  let source = readFileSync(SOURCE, "utf8");
  if (version !== DDRAGON_VERSION) {
    source = source.replace(
      `export const DDRAGON_VERSION = ${JSON.stringify(DDRAGON_VERSION)};`,
      `export const DDRAGON_VERSION = ${JSON.stringify(version)};`,
    );
  }
  if (missing.length > 0) source = insertNames(source, missing.map((champion) => champion.name));
  writeFileSync(SOURCE, source);

  console.log(`\nUpdated ${SOURCE}.`);
  if (missing.length > 0) {
    console.log("The champions test will now FAIL until every new champion has roles.");
    console.log("That is deliberate — a champion with no roles claims to play all five.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

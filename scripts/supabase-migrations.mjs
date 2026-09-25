#!/usr/bin/env node
// Preserve immutable historical SQL while presenting one file per version
// to Supabase. Both migrations at a known duplicate version run in order,
// and a reviewed override replaces SQL that cannot run as written.
//
//   list | push [--dry-run] [--yes]   the linked database, through the CLI
//   stage <dir> [--fresh]             a local project for --workdir <dir>;
//                                     --fresh for an empty database
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');

// Version collisions the history already carries, each pair applied to the
// linked database before anyone noticed. Both files of a pair are immutable
// (one side would have to be re-versioned after it was applied), so the
// wrapper presents each pair as one staged file. Filename order within a
// pair; the two halves of each pair touch unrelated objects.
const knownDuplicates = [
  ['20260915000001_expedition_encounters.sql', '20260915000001_god_packs.sql'],
  // 20261005000001: the academy roster sync reached develop under this
  // version while the analytics overview took the same one. (Its
  // 20261005000002 twin went straight to main with identical SQL; the
  // migration is idempotent, so the repeat is a no-op.)
  ['20261005000001_academy_card_claim_roster_sync.sql', '20261005000001_analytics_overview.sql'],
  // 20261009000001: the expeditions road migration landed on develop the
  // same day the migration-audit repairs went straight to main.
  ['20261009000001_expedition_roads.sql', '20261009000001_migration_audit_repairs.sql'],
];

// Reviewed replacements, staged under the original's version and name, for
// immutable migrations that cannot run as written. Each entry pins the git
// blob id (`git hash-object <file>`) of the original it was reviewed against
// and of the replacement itself: if either file changes, staging fails
// instead of silently replacing SQL nobody reviewed. Replacements live in
// supabase/migration-overrides/ (paths below are relative to it); a file
// there without an entry is refused too.
//
// A `fresh` entry applies only to `stage --fresh` (an empty database: local
// resets and CI). `list` and `push` for the linked database never use it.
const migrationOverrides = [
  {
    // card_art_champion_key() and card_art_champion_display() are
    // `language sql` functions whose bodies are a bare `case ... end`, a
    // syntax error on every PostgreSQL. The replacement adds `select`.
    migration: '20261018000001_card_art_champion_preferences.sql',
    original: 'adbe558c876189cfefe2702c5792c608e77e1490',
    replacement: '20261018000001_card_art_champion_preferences.sql',
    replacementBlob: '5c80a7d54bb070c0722e2072a995be438245e87b',
    fresh: false,
  },
  {
    // A data repair restored after it was applied to the linked database
    // (restoredApplied in check-migrations.mjs). It sorts before the
    // migration that creates season_end_releases, so it cannot compile on a
    // fresh database, which has no draft to repair anyway.
    migration: '20260922052204_rebuild_season_end_draft_after_hash_fix.sql',
    original: '787088fc1e1a149e165de22cb592c09b26cd7144',
    replacement: 'fresh/20260922052204_rebuild_season_end_draft_after_hash_fix.sql',
    replacementBlob: '86f0a347089dd07e7ed9aa8c7ef87ae0bbe7a2f6',
    fresh: true,
  },
];

// The id Git gives a file's content, over LF line endings (what the
// repository stores), so a CRLF checkout on Windows still matches its pin.
export function gitBlobId(text) {
  const bytes = Buffer.from(text.replace(/\r\n/g, '\n'), 'utf8');
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

function sqlFiles(directory, prefix = '') {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? sqlFiles(join(directory, entry.name), `${prefix}${entry.name}/`)
    : entry.name.endsWith('.sql') ? [`${prefix}${entry.name}`] : []);
}

function reviewedOverrides(overrides, overridesDir) {
  const known = new Set(overrides.map(entry => entry.replacement));
  for (const file of sqlFiles(overridesDir)) {
    if (!known.has(file)) throw new Error(`Unpinned migration override: ${file}. Add a reviewed entry to migrationOverrides in scripts/supabase-migrations.mjs or remove the file.`);
  }
  return new Map(overrides.map(entry => {
    const path = join(overridesDir, entry.replacement);
    if (!existsSync(path)) throw new Error(`Missing migration override ${entry.replacement} for ${entry.migration}.`);
    const sql = readFileSync(path, 'utf8');
    const blob = gitBlobId(sql);
    if (blob !== entry.replacementBlob) {
      throw new Error(`Migration override ${entry.replacement} has git blob ${blob}, not the reviewed ${entry.replacementBlob}. Review the change and update its pin in scripts/supabase-migrations.mjs.`);
    }
    return [entry.migration, { ...entry, sql }];
  }));
}

export function stageMigrations(source, destination, {
  fresh = false,
  overrides = migrationOverrides,
  overridesDir = join(root, 'supabase/migration-overrides'),
} = {}) {
  const groups = new Map();
  for (const name of readdirSync(source).filter(name => name.endsWith('.sql')).sort()) {
    if (!/^\d{14}_[a-zA-Z0-9_]+\.sql$/.test(name)) throw new Error(`Invalid migration filename: ${name}`);
    const version = name.split('_')[0];
    groups.set(version, [...(groups.get(version) ?? []), name]);
  }
  for (const names of groups.values()) {
    if (names.length > 1 && !knownDuplicates.some(pair => JSON.stringify(names) === JSON.stringify(pair))) {
      throw new Error(`Unreviewed duplicate migration version: ${names.join(', ')}`);
    }
  }
  const replacements = reviewedOverrides(overrides, overridesDir);
  // Every pin is checked in every mode, so a changed original fails loudly
  // even where its replacement would not have been used.
  const read = name => {
    const sql = readFileSync(join(source, name), 'utf8');
    const override = replacements.get(name);
    if (!override) return sql;
    const blob = gitBlobId(sql);
    if (blob !== override.original) {
      throw new Error(`Migration ${name} has git blob ${blob}, but its override ${override.replacement} was reviewed against ${override.original}. Review the override again and update its pins in scripts/supabase-migrations.mjs.`);
    }
    return override.fresh && !fresh ? sql : override.sql;
  };
  mkdirSync(destination, { recursive: true });
  for (const names of groups.values()) {
    const sql = names.map(read).join('\n\n');
    writeFileSync(join(destination, names[0]), sql);
  }
}

// A complete Supabase project for the local CLI: config, edge functions,
// staged migrations and the pgTAP suite (the numbered tests and their
// helpers, not the operational scripts that share supabase/tests), so
// `supabase start|db start|db reset|test db --workdir <destination>` work
// without further arguments. It shares the repository's project_id, so it
// drives the same local containers and volume. Staging replaces only the
// directories it writes.
export function stageProject(destination, { fresh = false } = {}) {
  const target = resolve(destination);
  if (target === root) throw new Error('Refusing to stage over the repository itself; name a separate directory.');
  const project = join(target, 'supabase');
  for (const directory of ['migrations', 'tests', 'functions']) rmSync(join(project, directory), { recursive: true, force: true });
  mkdirSync(join(project, 'tests'), { recursive: true });
  cpSync(join(root, 'supabase/config.toml'), join(project, 'config.toml'));
  cpSync(join(root, 'supabase/functions'), join(project, 'functions'), { recursive: true });
  stageMigrations(join(root, 'supabase/migrations'), join(project, 'migrations'), { fresh });
  const tests = join(root, 'supabase/tests');
  for (const name of readdirSync(tests).filter(name => /^[0-9].*_test\.sql$/.test(name))) {
    cpSync(join(tests, name), join(project, 'tests', name));
  }
  cpSync(join(tests, 'helpers'), join(project, 'tests/helpers'), { recursive: true });
  return project;
}

const usage = 'Usage: node scripts/supabase-migrations.mjs list | push [--dry-run] [--yes] | stage <dir> [--fresh]';

export function main(args) {
  const [command, ...flags] = args;
  if (command === 'stage') {
    const [destination, ...options] = flags;
    if (!destination || destination.startsWith('-') || options.some(option => option !== '--fresh')) throw new Error(usage);
    const fresh = options.includes('--fresh');
    stageProject(destination, { fresh });
    console.log(fresh
      ? `Staged a fresh-database project in ${destination}. Use it with: npx supabase start|db start|db reset|test db --workdir ${destination}`
      : `Staged the migrations \`push\` sends to the linked database in ${destination}. A fresh database needs --fresh.`);
    return 0;
  }
  if (!['list', 'push'].includes(command) || flags.some(flag => !['--dry-run', '--yes'].includes(flag))) {
    throw new Error(usage);
  }
  const staging = mkdtempSync(join(tmpdir(), 'fpl-migrations-'));
  try {
    mkdirSync(join(staging, 'supabase'));
    cpSync(join(root, 'supabase/config.toml'), join(staging, 'supabase/config.toml'));
    cpSync(join(root, 'supabase/.temp'), join(staging, 'supabase/.temp'), { recursive: true });
    stageMigrations(join(root, 'supabase/migrations'), join(staging, 'supabase/migrations'));
    const cliArgs = command === 'list' ? ['migration', 'list'] : ['db', 'push'];
    const result = spawnSync(join(root, 'node_modules/.bin/supabase'),
      [...cliArgs, '--linked', '--workdir', staging, ...flags], { stdio: 'inherit' });
    if (result.error) throw result.error;
    return result.status ?? 1;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

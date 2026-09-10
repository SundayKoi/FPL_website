#!/usr/bin/env node
// Preserve immutable historical SQL while presenting one file per version
// to Supabase. Both migrations at the legacy duplicate version run in order.
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const legacyDuplicate = [
  '20260915000001_expedition_encounters.sql',
  '20260915000001_god_packs.sql',
];

export function stageMigrations(source, destination) {
  const groups = new Map();
  for (const name of readdirSync(source).filter(name => name.endsWith('.sql')).sort()) {
    if (!/^\d{14}_[a-zA-Z0-9_]+\.sql$/.test(name)) throw new Error(`Invalid migration filename: ${name}`);
    const version = name.split('_')[0];
    groups.set(version, [...(groups.get(version) ?? []), name]);
  }
  for (const names of groups.values()) {
    if (names.length > 1 && JSON.stringify(names) !== JSON.stringify(legacyDuplicate)) {
      throw new Error(`Unreviewed duplicate migration version: ${names.join(', ')}`);
    }
  }
  mkdirSync(destination, { recursive: true });
  for (const names of groups.values()) {
    const sql = names.map(name => readFileSync(join(source, name), 'utf8')).join('\n\n');
    writeFileSync(join(destination, names[0]), sql);
  }
}

export function main(args) {
  const [command, ...flags] = args;
  if (!['list', 'push'].includes(command) || flags.some(flag => !['--dry-run', '--yes'].includes(flag))) {
    throw new Error('Usage: node scripts/supabase-migrations.mjs list | push [--dry-run] [--yes]');
  }
  const root = resolve(import.meta.dirname, '..');
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

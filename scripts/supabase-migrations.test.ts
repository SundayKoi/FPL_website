import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stageMigrations } from './supabase-migrations.mjs';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'migration-test-')); roots.push(root);
  const source = join(root, 'source'); mkdirSync(source);
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(source, name), sql);
  return { source, destination: join(root, 'staged') };
}
test('combines the known collision in original order without changing source files', () => {
  const files = {
    '20260915000001_god_packs.sql': 'select 2;',
    '20260915000001_expedition_encounters.sql': 'select 1;',
    '20261003000001_fix.sql': 'select 3;',
  };
  const { source, destination } = fixture(files);
  stageMigrations(source, destination);
  expect(readdirSync(destination)).toHaveLength(2);
  expect(readFileSync(join(destination, '20260915000001_expedition_encounters.sql'), 'utf8')).toBe('select 1;\n\nselect 2;');
  for (const [name, sql] of Object.entries(files)) expect(readFileSync(join(source, name), 'utf8')).toBe(sql);
});
test('refuses new collisions instead of hiding them', () => {
  const { source, destination } = fixture({ '20261004000001_a.sql': 'select 1;', '20261004000001_b.sql': 'select 2;' });
  expect(() => stageMigrations(source, destination)).toThrow('Unreviewed duplicate');
});
test('refuses malformed migration versions', () => {
  const { source, destination } = fixture({ 'broken.sql': 'select 1;' });
  expect(() => stageMigrations(source, destination)).toThrow('Invalid migration filename');
});

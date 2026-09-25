import { afterEach, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gitBlobId, main, stageMigrations, stageProject } from './supabase-migrations.mjs';
const repo = resolve(import.meta.dirname, '..');
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function scratch() {
  const root = mkdtempSync(join(tmpdir(), 'migration-test-')); roots.push(root);
  return root;
}
function fixture(files: Record<string, string>) {
  const root = scratch();
  const source = join(root, 'source'); mkdirSync(source);
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(source, name), sql);
  return { root, source, destination: join(root, 'staged') };
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
test.each([
  ['20261005000001_academy_card_claim_roster_sync.sql', '20261005000001_analytics_overview.sql'],
  ['20261009000001_expedition_roads.sql', '20261009000001_migration_audit_repairs.sql'],
])('combines the later known collision %s + %s the same way', (first, second) => {
  const { source, destination } = fixture({ [second]: 'select 2;', [first]: 'select 1;' });
  stageMigrations(source, destination);
  expect(readdirSync(destination)).toEqual([first]);
  expect(readFileSync(join(destination, first), 'utf8')).toBe('select 1;\n\nselect 2;');
});
test('refuses new collisions instead of hiding them', () => {
  const { source, destination } = fixture({ '20261004000001_a.sql': 'select 1;', '20261004000001_b.sql': 'select 2;' });
  expect(() => stageMigrations(source, destination)).toThrow('Unreviewed duplicate');
});
test('refuses malformed migration versions', () => {
  const { source, destination } = fixture({ 'broken.sql': 'select 1;' });
  expect(() => stageMigrations(source, destination)).toThrow('Invalid migration filename');
});

// === reviewed overrides =======================================================
// A fixture history with one broken migration, one fresh-only repair and a
// bystander, plus an overrides directory pinned to exactly those bytes.
const broken = 'create function f() returns int language sql as $$ case when true then 1 end $$;\n';
const repaired = '-- reviewed\ncreate function f() returns int language sql as $$ select case when true then 1 end $$;\n';
const repair = 'do $$ declare r public.later%rowtype; begin null; end $$;\n';
const standDown = '-- fresh database: nothing to repair\n';
function overrideFixture() {
  const files = {
    '20260101000001_broken.sql': broken,
    '20260101000002_repair.sql': repair,
    '20260101000003_bystander.sql': 'select 3;\n',
  };
  const paths = fixture(files);
  const overridesDir = join(paths.root, 'overrides');
  mkdirSync(join(overridesDir, 'fresh'), { recursive: true });
  writeFileSync(join(overridesDir, '20260101000001_broken.sql'), repaired);
  writeFileSync(join(overridesDir, 'fresh/20260101000002_repair.sql'), standDown);
  const overrides = [
    { migration: '20260101000001_broken.sql', original: gitBlobId(broken), replacement: '20260101000001_broken.sql', replacementBlob: gitBlobId(repaired), fresh: false },
    { migration: '20260101000002_repair.sql', original: gitBlobId(repair), replacement: 'fresh/20260101000002_repair.sql', replacementBlob: gitBlobId(standDown), fresh: true },
  ];
  const staged = (name: string, destination = paths.destination) => readFileSync(join(destination, name), 'utf8');
  return { ...paths, files, overridesDir, overrides, staged };
}
test('pins are git blob ids, over LF line endings', () => {
  const file = join(scratch(), 'x.sql');
  writeFileSync(file, repaired);
  expect(gitBlobId(repaired)).toBe(execFileSync('git', ['hash-object', file], { encoding: 'utf8' }).trim());
  expect(gitBlobId(repaired.replace(/\n/g, '\r\n'))).toBe(gitBlobId(repaired));
});
test('stages a reviewed override under the original name in every mode, leaving the source alone', () => {
  const f = overrideFixture();
  stageMigrations(f.source, f.destination, { overrides: f.overrides, overridesDir: f.overridesDir });
  expect(readdirSync(f.destination)).toEqual(Object.keys(f.files));
  expect(f.staged('20260101000001_broken.sql')).toBe(repaired);
  expect(f.staged('20260101000003_bystander.sql')).toBe('select 3;\n');
  const fresh = join(f.root, 'fresh');
  stageMigrations(f.source, fresh, { fresh: true, overrides: f.overrides, overridesDir: f.overridesDir });
  expect(f.staged('20260101000001_broken.sql', fresh)).toBe(repaired);
  for (const [name, sql] of Object.entries(f.files)) expect(readFileSync(join(f.source, name), 'utf8')).toBe(sql);
});
test('stands a fresh-only migration down for a fresh database and stages it unchanged for the linked one', () => {
  const f = overrideFixture();
  stageMigrations(f.source, f.destination, { overrides: f.overrides, overridesDir: f.overridesDir });
  expect(f.staged('20260101000002_repair.sql')).toBe(repair);
  const fresh = join(f.root, 'fresh');
  stageMigrations(f.source, fresh, { fresh: true, overrides: f.overrides, overridesDir: f.overridesDir });
  expect(f.staged('20260101000002_repair.sql', fresh)).toBe(standDown);
});
test.each([false, true])('refuses to replace an original that changed since review (fresh: %s)', (fresh) => {
  const f = overrideFixture();
  writeFileSync(join(f.source, '20260101000001_broken.sql'), broken.replace('1 end', '2 end'));
  expect(() => stageMigrations(f.source, f.destination, { fresh, overrides: f.overrides, overridesDir: f.overridesDir }))
    .toThrow(`was reviewed against ${gitBlobId(broken)}`);
});
test('checks a fresh-only pin even when staging for the linked database', () => {
  const f = overrideFixture();
  writeFileSync(join(f.source, '20260101000002_repair.sql'), `${repair}select 1;\n`);
  expect(() => stageMigrations(f.source, f.destination, { overrides: f.overrides, overridesDir: f.overridesDir }))
    .toThrow('20260101000002_repair.sql has git blob');
});
test('refuses an override that changed since review', () => {
  const f = overrideFixture();
  writeFileSync(join(f.overridesDir, '20260101000001_broken.sql'), `${repaired}select 1;\n`);
  expect(() => stageMigrations(f.source, f.destination, { overrides: f.overrides, overridesDir: f.overridesDir }))
    .toThrow(`not the reviewed ${gitBlobId(repaired)}`);
});
test('refuses an override file nobody pinned', () => {
  const f = overrideFixture();
  writeFileSync(join(f.overridesDir, '20260101000003_bystander.sql'), 'select 4;\n');
  expect(() => stageMigrations(f.source, f.destination, { overrides: f.overrides, overridesDir: f.overridesDir }))
    .toThrow('Unpinned migration override: 20260101000003_bystander.sql');
});

// === the repository's own history =============================================
// The pins above are the repository's too: npm test fails if either
// immutable original or its reviewed replacement changes.
const cardArt = '20261018000001_card_art_champion_preferences.sql';
const draftRepair = '20260922052204_rebuild_season_end_draft_after_hash_fix.sql';
const repoFile = (path: string) => readFileSync(join(repo, path), 'utf8');
test('the linked database gets the corrected card-art migration and the draft repair unchanged', () => {
  const destination = join(scratch(), 'linked');
  stageMigrations(join(repo, 'supabase/migrations'), destination);
  expect(readFileSync(join(destination, cardArt), 'utf8')).toBe(repoFile(`supabase/migration-overrides/${cardArt}`));
  expect(readFileSync(join(destination, draftRepair), 'utf8')).toBe(repoFile(`supabase/migrations/${draftRepair}`));
});
test('the card-art override differs from its original only by its header and the two `select`s', () => {
  const original = repoFile(`supabase/migrations/${cardArt}`);
  const override = repoFile(`supabase/migration-overrides/${cardArt}`);
  const body = override.slice(override.indexOf('\n\n') + 2);
  expect(original).toMatch(/as \$\$\n {2}case /);
  expect(body).not.toMatch(/as \$\$\n {2}case /);
  expect(body.split('as $$\n  select case ').join('as $$\n  case ')).toBe(original);
});
test('stage --fresh writes a complete project with both fixes and only the numbered pgTAP suite', () => {
  const destination = join(scratch(), 'project');
  expect(main(['stage', destination, '--fresh'])).toBe(0);
  const project = join(destination, 'supabase');
  expect(readFileSync(join(project, 'config.toml'), 'utf8')).toBe(repoFile('supabase/config.toml'));
  expect(existsSync(join(project, 'functions/discord-announcer/index.ts'))).toBe(true);
  expect(readFileSync(join(project, 'migrations', cardArt), 'utf8')).toBe(repoFile(`supabase/migration-overrides/${cardArt}`));
  expect(readFileSync(join(project, 'migrations', draftRepair), 'utf8'))
    .toBe(repoFile(`supabase/migration-overrides/fresh/${draftRepair}`));
  const suite = readdirSync(join(repo, 'supabase/tests')).filter(name => /^[0-9].*_test\.sql$/.test(name)).sort();
  expect(readdirSync(join(project, 'tests')).sort()).toEqual([...suite, 'helpers'].sort());
  expect(readdirSync(join(project, 'tests/helpers'))).toEqual(readdirSync(join(repo, 'supabase/tests/helpers')));
});
test('restaging replaces what an earlier stage left behind', () => {
  const destination = join(scratch(), 'project');
  stageProject(destination, { fresh: true });
  writeFileSync(join(destination, 'supabase/migrations/29990101000001_stale.sql'), 'select 1;');
  writeFileSync(join(destination, 'supabase/tests/9999_stale_test.sql'), 'select 1;');
  stageProject(destination, { fresh: true });
  expect(existsSync(join(destination, 'supabase/migrations/29990101000001_stale.sql'))).toBe(false);
  expect(existsSync(join(destination, 'supabase/tests/9999_stale_test.sql'))).toBe(false);
});
test('stage without --fresh stages what push sends', () => {
  const destination = join(scratch(), 'project');
  expect(main(['stage', destination])).toBe(0);
  expect(readFileSync(join(destination, 'supabase/migrations', draftRepair), 'utf8')).toBe(repoFile(`supabase/migrations/${draftRepair}`));
});
test.each([[['stage']], [['stage', '--fresh']], [['stage', 'dir', '--yes']], [['push', '--fresh']]])('rejects the usage %j', (args) => {
  expect(() => main(args)).toThrow('Usage:');
});
test('refuses to stage over the repository itself', () => {
  expect(() => stageProject(repo, { fresh: true })).toThrow('Refusing to stage over the repository');
});

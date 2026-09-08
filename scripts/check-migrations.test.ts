// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { afterEach, expect, it } from "vitest";

const script = resolve("scripts/check-migrations.mjs");
const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function fixture(existingDuplicate = false) {
  const cwd = mkdtempSync(join(tmpdir(), "migration-check-"));
  directories.push(cwd);
  const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  const folder = join(cwd, "supabase/migrations");
  mkdirSync(folder, { recursive: true });
  const add = (name: string, sql = "select 1;\n") => writeFileSync(join(folder, name), sql);
  const commit = () => { git("add", "."); git("-c", "commit.gpgsign=false", "commit", "-qm", "fixture", "--allow-empty"); return git("rev-parse", "HEAD"); };
  add("20260929000001_existing.sql");
  if (existingDuplicate) add("20260929000001_legacy_duplicate.sql");
  const base = commit();
  const check = (ref = base) => { commit(); return spawnSync(process.execPath, [script, ref], { cwd, encoding: "utf8" }); };
  return { add, check, folder };
}

it("accepts unchanged history and forward migrations", () => {
  const f = fixture();
  expect(f.check().status).toBe(0);
  f.add("20260930000001_next.sql");
  expect(f.check().status).toBe(0);
});

it("rejects a backdated migration even when another new migration is newer", () => {
  const f = fixture();
  f.add("20260915000001_god_packs.sql");
  f.add("20260930000001_next.sql");
  const result = f.check();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("new version must sort after 20260929000001");
});

it.each(["edit", "delete", "rename"])("rejects %s of an existing migration", (action) => {
  const f = fixture();
  const file = join(f.folder, "20260929000001_existing.sql");
  if (action === "edit") writeFileSync(file, "select 2;");
  if (action === "delete") rmSync(file);
  if (action === "rename") renameSync(file, join(f.folder, "20260930000001_renamed.sql"));
  expect(f.check().stderr).toContain("existing migrations must not be modified");
});

it("rejects duplicate versions", () => {
  const f = fixture();
  f.add("20260930000001_one.sql");
  f.add("20260930000001_two.sql");
  expect(f.check().stderr).toContain("duplicate version");
});

it("rejects malformed SQL filenames and unavailable base commits", () => {
  const f = fixture();
  f.add("bad.sql");
  expect(f.check().stderr).toContain("expected <14-digit-version>");
  expect(f.check("missing-ref").status).toBe(1);
  expect(f.check("0000000000000000000000000000000000000000").status).toBe(1);
});

it("warns about inherited duplicates but rejects additional collisions", () => {
  const f = fixture(true);
  const unchanged = f.check();
  expect(unchanged.status).toBe(0);
  expect(unchanged.stderr).toContain("Existing migration history warning");
  f.add("20260929000001_another.sql");
  expect(f.check().status).toBe(1);
});

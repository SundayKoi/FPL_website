// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";

const script = resolve("scripts/vercel-ignore.sh");
const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** A repo with one commit, and a way to add commits and run the gate in it. */
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "vercel-ignore-"));
  directories.push(cwd);
  const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  const commit = (path: string) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), `${Math.random()}\n`);
    git("add", ".");
    git("-c", "commit.gpgsign=false", "commit", "-qm", path);
    return git("rev-parse", "HEAD");
  };
  const first = commit("src/app/page.tsx");
  // Exit 0 skips the build, exit 1 builds. Vercel's variables start blank so
  // the machine running the tests cannot leak its own into a case.
  const blank = { VERCEL_ENV: "", VERCEL_GIT_COMMIT_REF: "", VERCEL_GIT_PREVIOUS_SHA: "", VERCEL_GIT_COMMIT_SHA: "" };
  const gate = (env: Partial<typeof blank>) =>
    spawnSync("bash", [script], { cwd, encoding: "utf8", env: { ...process.env, ...blank, ...env } }).status;
  return { commit, first, gate };
}

it("skips previews unless the branch asks for one", () => {
  const f = fixture();
  expect(f.gate({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "develop" })).toBe(0);
  expect(f.gate({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/cards" })).toBe(1);
});

it("builds production only when shipped files changed", () => {
  const f = fixture();
  const docs = f.commit("docs/notes.md");
  expect(f.gate({ VERCEL_ENV: "production", VERCEL_GIT_PREVIOUS_SHA: f.first, VERCEL_GIT_COMMIT_SHA: docs })).toBe(0);
  const site = f.commit("src/app/layout.tsx");
  expect(f.gate({ VERCEL_ENV: "production", VERCEL_GIT_PREVIOUS_SHA: docs, VERCEL_GIT_COMMIT_SHA: site })).toBe(1);
});

it("builds a Redeploy of the live commit, so a changed environment variable reaches the site", () => {
  const f = fixture();
  const docs = f.commit("docs/notes.md");
  expect(f.gate({ VERCEL_ENV: "production", VERCEL_GIT_PREVIOUS_SHA: docs, VERCEL_GIT_COMMIT_SHA: docs })).toBe(1);
});

it("builds once when the gate itself changes", () => {
  const f = fixture();
  const gate = f.commit("scripts/vercel-ignore.sh");
  expect(f.gate({ VERCEL_ENV: "production", VERCEL_GIT_PREVIOUS_SHA: f.first, VERCEL_GIT_COMMIT_SHA: gate })).toBe(1);
});

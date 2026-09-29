#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { stageMigrations } from "./supabase-migrations.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const CLI = join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "supabase.cmd" : "supabase");
const NEXT_TEST_ENV = [
  "ANTHROPIC_API_KEY",
  "BETTING_GATE_DISABLED",
  "DISCORD_APP_ID",
  "DISCORD_BOT_TOKEN",
  "DISCORD_CARDS_CHANNEL_ID",
  "DISCORD_CARDS_WEBHOOK_URL",
  "DISCORD_GUILD_ID",
  "DISCORD_PUBLIC_KEY",
  "DISCORD_REQUIRED_ROLE_ID",
  "DISCORD_STAFF_ROLE_ID",
  "NEXT_PUBLIC_DISCORD_INVITE_URL",
  "RIOT_API_KEY",
  "TWITCH_CLIENT_ID",
  "TWITCH_CLIENT_SECRET",
];
const SUPABASE_OVERRIDE_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_URL",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_ACCESS_TOKEN",
];
const OMIT_SERVICES = "studio,storage-api,imgproxy,mailpit,edge-runtime,logflare,vector,postgres-meta,supavisor";
export function assertNoAmbientSupabaseOverrides(environment) {
  const names = SUPABASE_OVERRIDE_KEYS.filter((key) => environment[key] != null && environment[key] !== "");
  if (names.length) {
    throw new Error(`Unset ambient Supabase variables before running isolated tests (${names.join(", ")}).`);
  }
}

function assertLoopbackURL(value, label, allowCredentials = false) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} is not a valid URL.`);
  }
  const loopback = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);
  if (!loopback.has(url.hostname) || (!allowCredentials && (url.username || url.password))) {
    throw new Error(`${label} must target an explicit loopback endpoint.`);
  }
  return url;
}

export function validateLocalStackStatus(status, expected) {
  if (!status || typeof status !== "object") throw new Error("Supabase status did not return an object.");
  const api = assertLoopbackURL(status.API_URL, "Supabase API URL");
  const db = assertLoopbackURL(status.DB_URL, "Supabase database URL", true);
  if (api.protocol !== "http:" || api.port !== String(expected.apiPort)) {
    throw new Error("Supabase API URL does not match the selected local test stack.");
  }
  if (!new Set(["postgres:", "postgresql:"]).has(db.protocol) || db.port !== String(expected.dbPort)) {
    throw new Error("Supabase database URL does not match the selected local test stack.");
  }
  if (typeof status.ANON_KEY !== "string" || status.ANON_KEY.length < 16 ||
      typeof status.SERVICE_ROLE_KEY !== "string" || status.SERVICE_ROLE_KEY.length < 16 ||
      status.ANON_KEY === status.SERVICE_ROLE_KEY) {
    throw new Error("Supabase status did not provide a matching local key pair.");
  }
  return {
    apiUrl: api.origin,
    dbUrl: status.DB_URL,
    anonKey: status.ANON_KEY,
    serviceRoleKey: status.SERVICE_ROLE_KEY,
  };
}

export function shouldRestoreGeneratedTypeReferences(original, current, temporaryBuildDir) {
  return !original.includes(temporaryBuildDir) && current.includes(temporaryBuildDir);
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate a local test port.");
  const port = address.port;
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return port;
}

async function uniquePorts(names) {
  const selected = new Set();
  const ports = {};
  for (const name of names) {
    let port;
    do {
      port = await availablePort();
    } while (selected.has(port));
    selected.add(port);
    ports[name] = port;
  }
  return ports;
}

function updateSection(config, sectionName, update) {
  const lines = config.split(/\r?\n/);
  let active = false;
  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^\[([^\]]+)\]\s*$/);
    if (heading) active = heading[1] === sectionName;
    if (active) update(lines, index);
  }
  return lines.join("\n");
}

function updatePort(config, sectionName, port) {
  let changed = false;
  const updated = updateSection(config, sectionName, (lines, index) => {
    if (!changed && /^port\s*=\s*\d+\s*$/.test(lines[index])) {
      lines[index] = `port = ${port}`;
      changed = true;
    }
  });
  if (!changed) throw new Error(`Could not find [${sectionName}].port in Supabase config.`);
  return updated;
}

function redact(text, secrets = []) {
  let output = String(text ?? "");
  for (const secret of secrets) {
    if (secret && secret.length > 8) output = output.split(secret).join("[redacted]");
  }
  return output
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted jwt]")
    .replace(/((?:postgres(?:ql)?):\/\/[^:/@\s]+:)[^@\s]+(@)/gi, "$1[redacted]$2");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    env: options.env ?? process.env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: options.timeoutMs ?? 300_000,
    killSignal: "SIGTERM",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.error) {
    const safeOutput = redact(output, options.secrets).trim().slice(-14_000);
    const timeout = result.error.code === "ETIMEDOUT" ? ` exceeded ${options.timeoutMs ?? 300_000}ms` : " could not be started";
    throw new Error(`${options.label ?? command}${timeout}: ${result.error.message}${safeOutput ? `\n${safeOutput}` : ""}`);
  }
  if (result.status !== 0) {
    const safeOutput = redact(output, options.secrets);
    const lines = safeOutput.split(/\r?\n/);
    let structuredMessage = "";
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        const message = parsed?.error?.error?.message;
        if (typeof message === "string") {
          structuredMessage = message.split(/\r?\n/, 1)[0];
          break;
        }
      } catch {
        // Supabase only emits structured JSON for some CLI failures.
      }
    }
    const errorLines = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => /(?:ERROR:|FATAL:|SQLSTATE|failed to|migration failed|does not exist|permission denied|syntax error|panic:|\bnot ok\b|\bFailed\b|\bDubious\b|Looks like.*failed)/i.test(line));
    const tapDetails = lines.filter((line) => /^# (?:Failed test|Looks like you failed|\s*(?:error message|died|have|want|HINT|CONTEXT):)|^(?:Failed \d+\/\d+ subtests|Dubious:|Test Summary Report)/i.test(line));
    const context = new Set();
    for (const { index } of errorLines.slice(-100)) {
      for (let cursor = Math.max(0, index - 2); cursor <= Math.min(lines.length - 1, index + 3); cursor += 1) context.add(cursor);
    }
    const diagnostics = [...context].sort((left, right) => left - right).map((index) => lines[index]).join("\n");
    const detail = structuredMessage || tapDetails.join("\n") || diagnostics || safeOutput.trim().slice(-14000);
    throw new Error(`${options.label ?? command} failed with exit code ${result.status ?? 1}.${detail ? `\n${detail}` : ""}`);
  }
  if (options.printOutput && output) process.stdout.write(redact(output, options.secrets));
  return result.stdout ?? "";
}

function makeTestProject(projectDir, projectId, ports) {
  const supabaseDir = join(projectDir, "supabase");
  mkdirSync(supabaseDir, { recursive: true });
  let config = readFileSync(join(ROOT, "supabase", "config.toml"), "utf8");
  config = config.replace(/^project_id\s*=\s*"[^"]+"/m, `project_id = "${projectId}"`);
  for (const [section, port] of Object.entries(ports)) config = updatePort(config, section, port);
  config = updateSection(config, "db.seed", (lines, index) => {
    if (/^enabled\s*=/.test(lines[index])) lines[index] = "enabled = false";
    if (/^sql_paths\s*=/.test(lines[index])) lines[index] = "sql_paths = []";
  });
  for (const section of ["studio", "local_smtp", "analytics"]) {
    config = updateSection(config, section, (lines, index) => {
      if (/^enabled\s*=/.test(lines[index])) lines[index] = "enabled = false";
    });
  }
  writeFileSync(join(supabaseDir, "config.toml"), config, "utf8");
  const seed = join(ROOT, "supabase", "seed.sql");
  if (existsSync(seed)) copyFileSync(seed, join(supabaseDir, "seed.sql"));
  else writeFileSync(join(supabaseDir, "seed.sql"), "-- E2E fixtures own all test data.\n", "utf8");
  const migrationResult = stageMigrations(join(ROOT, "supabase", "migrations"), join(supabaseDir, "migrations"));
  cpSync(join(ROOT, "supabase", "tests"), join(supabaseDir, "tests"), { recursive: true });
  const replayFixtureDir = join(supabaseDir, "tests", "helpers");
  mkdirSync(replayFixtureDir, { recursive: true });
  copyFileSync(
    join(ROOT, "supabase", "migrations", "20260922052204_rebuild_season_end_draft_after_hash_fix.sql"),
    join(replayFixtureDir, "20260922052204_rebuild_season_end_draft_after_hash_fix.sql"),
  );
  return migrationResult;
}

function testEnvironment(stack, projectDir, projectId, distDir, appPort) {
  const child = { ...process.env };
  for (const key of SUPABASE_OVERRIDE_KEYS) delete child[key];
  for (const key of NEXT_TEST_ENV) delete child[key];
  Object.assign(child, {
    SUPABASE_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_SUPABASE_URL: stack.apiUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: stack.anonKey,
    SUPABASE_URL: stack.apiUrl,
    SUPABASE_ANON_KEY: stack.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: stack.serviceRoleKey,
    NEXT_PUBLIC_DISCORD_INVITE_URL: "/league-links",
    NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${appPort}`,
    SITE_URL: `http://127.0.0.1:${appPort}`,
    BETTING_GATE_DISABLED: "",
    DISCORD_APP_ID: "",
    DISCORD_BOT_TOKEN: "",
    DISCORD_CARDS_CHANNEL_ID: "",
    DISCORD_CARDS_WEBHOOK_URL: "",
    DISCORD_GUILD_ID: "",
    DISCORD_PUBLIC_KEY: "",
    DISCORD_REQUIRED_ROLE_ID: "",
    DISCORD_STAFF_ROLE_ID: "",
    RIOT_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    TWITCH_CLIENT_ID: "",
    TWITCH_CLIENT_SECRET: "",
    FPL_TEST_STACK_DIR: projectDir,
    FPL_TEST_PROJECT_ID: projectId,
    FPL_TEST_SUPABASE_URL: stack.apiUrl,
    FPL_TEST_SUPABASE_ANON_KEY: stack.anonKey,
    FPL_TEST_SUPABASE_SERVICE_ROLE_KEY: stack.serviceRoleKey,
    FPL_TEST_SUPABASE_DB_URL: stack.dbUrl,
    FPL_TEST_NEXT_DIST_DIR: distDir,
    FPL_TEST_APP_PORT: String(appPort),
  });
  return child;
}

function selectedTests(projectDir) {
  const directory = join(projectDir, "supabase", "tests");
  return readdirSync(directory)
    .filter((name) => /^\d{4}_.+_test\.sql$/.test(name))
    .sort()
    .map((name) => join(directory, name));
}

function isEnabled(flag) {
  return process.argv.includes(flag);
}

async function runSuite() {
  const args = process.argv.slice(2);
  if (args.includes("--list")) {
    run(join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "playwright.cmd" : "playwright"), ["test", "--list"], {
      label: "Playwright discovery",
      printOutput: true,
      env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" },
    });
    return;
  }
  assertNoAmbientSupabaseOverrides(process.env);

  const projectId = `fpl-e2e-${randomBytes(5).toString("hex")}`;
  const distDir = `.next-e2e-${projectId}`;
  const buildDir = join(ROOT, distDir);
  const tsconfigPath = join(ROOT, "tsconfig.json");
  const nextEnvPath = join(ROOT, "next-env.d.ts");
  const originalTsconfig = readFileSync(tsconfigPath, "utf8");
  const originalNextEnv = readFileSync(nextEnvPath, "utf8");
  if (existsSync(buildDir)) throw new Error("The isolated E2E build directory already exists; refusing to overwrite it.");
  const allPorts = await uniquePorts(["api", "db", "db.pooler", "studio", "local_smtp", "analytics", "app"]);
  const { app: appPort, ...ports } = allPorts;
  const projectDir = mkdtempSync(join(tmpdir(), "fpl-cleanup-test-stack-"));
  const stackPorts = {
    apiPort: ports.api,
    dbPort: ports.db,
  };
  const env = { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" };
  const secrets = [];
  let started = false;
  let failure;
  try {
    const migrationReplay = makeTestProject(projectDir, projectId, ports);
    console.log(`Prepared fresh migration replay (${migrationReplay.sourceFiles} source files → ${migrationReplay.stagedFiles} staged versions).`);
    console.log(`Starting isolated local Supabase project ${projectId}.`);
    started = true;
    run(CLI, ["start", "--workdir", projectDir, "--exclude", OMIT_SERVICES, "--yes"], {
      env,
      label: "Supabase local start",
      timeoutMs: 300_000,
      printOutput: true,
    });
    console.log("Checking that Supabase API, database, and keys belong to the isolated loopback stack.");
    const statusOutput = run(CLI, ["status", "--workdir", projectDir, "--output", "json"], {
      env,
      label: "Supabase local status",
      timeoutMs: 30_000,
    });
    const status = validateLocalStackStatus(JSON.parse(statusOutput), stackPorts);
    secrets.push(status.anonKey, status.serviceRoleKey);
    const suiteEnv = testEnvironment(status, projectDir, projectId, distDir, appPort);

    if (!isEnabled("--browser-only")) {
      const tests = selectedTests(projectDir);
      console.log(`Running ${tests.length} pgTAP files against the freshly replayed database.`);
      run(CLI, ["test", "db", "--local", "--workdir", projectDir, ...tests], {
        env,
        label: "Local pgTAP contracts",
        timeoutMs: 360_000,
        printOutput: true,
        secrets,
      });
    }
    if (!isEnabled("--db-only")) {
      console.log("Building the production app against the isolated local Supabase stack.");
      run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], {
        env: suiteEnv,
        label: "Next.js production build against the isolated local stack",
        timeoutMs: 360_000,
        printOutput: true,
        secrets,
      });
      const playwright = join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "playwright.cmd" : "playwright");
      console.log("Starting the production server and running the infrastructure browser journeys.");
      run(playwright, ["test", ...args.filter((arg) => !["--browser-only", "--db-only"].includes(arg))], {
        env: suiteEnv,
        label: "Infrastructure Playwright scenarios",
        timeoutMs: 420_000,
        printOutput: true,
        secrets,
      });
    }
  } catch (error) {
    failure = error;
  } finally {
    if (started) {
      try {
        run(CLI, ["stop", "--workdir", projectDir, "--no-backup"], {
          env,
          label: "Stop isolated Supabase test project",
          timeoutMs: 90_000,
        });
        console.log("Stopped isolated local Supabase project.");
      } catch (error) {
        console.error(redact(`Test-stack cleanup failed: ${error.message}`, secrets));
        if (!failure) failure = error;
      }
    }
    rmSync(buildDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
    try {
      const currentTsconfig = readFileSync(tsconfigPath, "utf8");
      if (shouldRestoreGeneratedTypeReferences(originalTsconfig, currentTsconfig, distDir)) {
        writeFileSync(tsconfigPath, originalTsconfig, "utf8");
        console.log("Restored tsconfig.json after Next.js added temporary isolated-build type paths.");
      }
      const currentNextEnv = readFileSync(nextEnvPath, "utf8");
      if (shouldRestoreGeneratedTypeReferences(originalNextEnv, currentNextEnv, distDir)) {
        writeFileSync(nextEnvPath, originalNextEnv, "utf8");
        console.log("Restored next-env.d.ts after Next.js added temporary isolated-build type references.");
      }
    } catch (error) {
      console.error(`Could not restore the pre-build TypeScript config: ${error.message}`);
      if (!failure) failure = error;
    }
  }
  if (failure) throw failure;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runSuite().catch((error) => {
    console.error(redact(error.stack ?? error.message));
    process.exitCode = 1;
  });
}

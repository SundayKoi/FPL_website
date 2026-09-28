import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type LocalTestSupabase = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  workdir: string;
  projectId: string;
};

const ROOT = process.cwd();
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}; run the fixture through the isolated E2E command.`);
  return value;
}

function isLoopbackUrl(value: string, protocols: string | string[], allowCredentials = false): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("E2E Supabase endpoints must be valid local URLs.");
  }
  const acceptedProtocols = new Set(Array.isArray(protocols) ? protocols : [protocols]);
  if (!acceptedProtocols.has(parsed.protocol) || !LOOPBACK_HOSTS.has(parsed.hostname) ||
      (!allowCredentials && (parsed.username || parsed.password))) {
    throw new Error("E2E Supabase endpoints must use the selected loopback test stack.");
  }
  return parsed;
}

export function getLocalTestSupabase(): LocalTestSupabase {
  const workdir = required("FPL_TEST_STACK_DIR");
  const projectId = required("FPL_TEST_PROJECT_ID");
  const url = required("FPL_TEST_SUPABASE_URL");
  const anonKey = required("FPL_TEST_SUPABASE_ANON_KEY");
  const serviceRoleKey = required("FPL_TEST_SUPABASE_SERVICE_ROLE_KEY");
  const configPath = join(workdir, "supabase", "config.toml");
  const config = readFileSync(configPath, "utf8");
  const configuredId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  const apiPort = config.match(/^\[api\][\s\S]*?^port\s*=\s*(\d+)/m)?.[1];
  const dbPort = config.match(/^\[db\][\s\S]*?^port\s*=\s*(\d+)/m)?.[1];
  const api = isLoopbackUrl(url, "http:");
  const dbUrl = required("FPL_TEST_SUPABASE_DB_URL");
  const db = isLoopbackUrl(dbUrl, ["postgres:", "postgresql:"], true);

  if (configuredId !== projectId || api.port !== apiPort || db.port !== dbPort) {
    throw new Error("E2E Supabase URL, database URL, and project config do not identify the same local stack.");
  }
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== url || process.env.SUPABASE_URL !== url ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== anonKey || process.env.SUPABASE_SERVICE_ROLE_KEY !== serviceRoleKey ||
      anonKey === serviceRoleKey) {
    throw new Error("E2E Supabase credentials do not match the selected local stack.");
  }

  return { url: api.origin, anonKey, serviceRoleKey, workdir, projectId };
}

export function runLocalTestSql(sql: string): void {
  const stack = getLocalTestSupabase();
  const tempDirectory = mkdtempSync(join(tmpdir(), "fpl-e2e-sql-"));
  const sqlPath = join(tempDirectory, "fixture.sql");
  writeFileSync(sqlPath, sql, "utf8");
  try {
    execFileSync(join(ROOT, "node_modules", ".bin", "supabase"), [
      "db", "query", "--local", "--workdir", stack.workdir, "--file", sqlPath,
    ], {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" },
    });
  } finally {
    unlinkSync(sqlPath);
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

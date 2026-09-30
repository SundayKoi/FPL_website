// Shared setup for operator scripts run with `npx tsx scripts/<name>.ts`.
// Not for src/: the service-role key must never reach app code or bundles.

import { createClient } from "@supabase/supabase-js";

/** A required environment variable; an empty value counts as missing. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** A service-role Supabase client from SUPABASE_URL and
 *  SUPABASE_SERVICE_ROLE_KEY, without session persistence. */
export function createServiceClientFromEnv() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

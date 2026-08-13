import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for the betting domain. The entire betting
 * RPC surface is locked to `service_role` in Postgres (see
 * supabase/migrations/20260813000003_betting_market_rpcs.sql's lockdown
 * migration and the Task 3 ruling) — betting authz lives in the app layer
 * (Discord role/staff checks in access.ts), not in Postgres grants, so every
 * server action or route handler that calls a betting RPC must go through
 * this client, never the cookie-bound anon client from
 * `@/lib/supabase/server`.
 *
 * `import "server-only"` makes importing this module from a Client
 * Component a build error — the service-role key must never reach a
 * browser bundle.
 */
export function createBettingServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

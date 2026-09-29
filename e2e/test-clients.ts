import { createClient } from "@supabase/supabase-js";
import { getLocalTestSupabase } from "./local-supabase";

// Browser journeys use the local anon key for user-scoped RLS assertions and
// the local service key only for authoritative persisted-state readback.
export function localAnonClient() {
  const { url, anonKey } = getLocalTestSupabase();
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function localServiceClient() {
  const { url, serviceRoleKey } = getLocalTestSupabase();
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function signedInLocalClient(email: string, password: string) {
  const client = localAnonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

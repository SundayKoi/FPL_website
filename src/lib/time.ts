import type { SupabaseClient } from "@supabase/supabase-js";

export async function fetchServerOffset(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc("get_server_time");
  if (error || !data) return 0; // degrade gracefully: trust local clock
  return new Date(data as string).getTime() - Date.now();
}

export function remainingMs(closesAt: string, offsetMs: number, nowMs: number = Date.now()): number {
  return Math.max(0, new Date(closesAt).getTime() - (nowMs + offsetMs));
}

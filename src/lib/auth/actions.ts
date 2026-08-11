"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createServerSupabase();
  // Clears the session cookies via cookieStore.set — only reachable from a
  // Server Action, where cookie writes are allowed (they're a no-op in RSC).
  await supabase.auth.signOut();
  redirect("/");
}

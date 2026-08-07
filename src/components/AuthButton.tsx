import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function AuthButton() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <Link href="/login" className="underline">Sign in</Link>;
  const { data: profile } = await supabase
    .from("profiles").select("display_name").eq("id", user.id).single();
  return <span className="text-sm">{profile?.display_name ?? user.email}</span>;
}

import Link from "next/link";
import { signOut } from "@/lib/auth/actions";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function AuthButton() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <Link href="/login" className="btn-pill text-sm">Sign in</Link>;
  const { data: profile } = await supabase
    .from("profiles").select("display_name").eq("id", user.id).single();
  return (
    <div className="flex items-center gap-3">
      <span className="text-steel hidden text-sm sm:inline">
        {profile?.display_name ?? user.email}
      </span>
      <form action={signOut}>
        <button type="submit" className="btn-pill text-sm">Sign out</button>
      </form>
    </div>
  );
}

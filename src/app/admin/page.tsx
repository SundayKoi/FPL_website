import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Draft } from "@/lib/draft/types";
import DraftListClient from "@/components/admin/DraftListClient";

export default async function AdminPage() {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", userData.user.id)
    .single();
  if (!profile?.is_admin) redirect("/");

  const { data } = await supabase.from("drafts").select("*").order("created_at", { ascending: false });
  const drafts = (data as Draft[]) ?? [];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16 text-zinc-100">
      <h1 className="text-2xl font-semibold tracking-tight">Admin — drafts</h1>
      <DraftListClient initialDrafts={drafts} />
    </main>
  );
}

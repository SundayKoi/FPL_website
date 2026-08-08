import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Draft } from "@/lib/draft/types";

export default async function Home() {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("drafts")
    .select("*")
    .order("created_at", { ascending: false });
  const drafts = (data as Draft[]) ?? [];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">FPL Draft League</h1>
        <Link href="/admin" className="underline">
          Admin
        </Link>
      </div>

      {drafts.length === 0 ? (
        <p className="text-sm opacity-60">No drafts yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {drafts.map((draft) => (
            <li key={draft.id}>
              <Link
                href={`/draft/${draft.id}`}
                className="flex items-center justify-between rounded-lg border px-4 py-3 hover:bg-zinc-500/10"
              >
                <span className="font-medium">{draft.name}</span>
                <span className="text-xs uppercase tracking-wide opacity-60">{draft.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

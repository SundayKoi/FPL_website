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
    <main className="bg-hash min-h-screen flex-1">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-16">
        <div className="flex flex-col gap-2">
          <span className="label-dash">FRANCHISE PREMIER LEAGUE</span>
          <div className="flex items-center justify-between">
            <h1 className="type-display text-5xl">DRAFTS</h1>
            <Link href="/admin" className="text-steel underline underline-offset-4 hover:text-white">
              Admin
            </Link>
          </div>
        </div>

        {drafts.length === 0 ? (
          <p className="text-sm text-steel">No drafts yet.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <Link
                  href={`/draft/${draft.id}`}
                  className="card-brand flex flex-col gap-2 px-5 py-4 transition-colors hover:border-steel"
                >
                  <span className="type-display text-xl">{draft.name}</span>
                  <span className="text-steel text-sm uppercase tracking-wide">{draft.status}</span>
                  <span className="label-dash">VIEW BOARD →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

import Link from "next/link";
import LeagueHub from "@/components/home/LeagueHub";
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
    <LeagueHub>
      <section
        id="draft-central"
        className="scroll-mt-24 pt-16"
        aria-labelledby="draft-central-title"
      >
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <span className="label-dash">LEAGUE OPERATIONS</span>
            <h2
              id="draft-central-title"
              className="type-display mt-2 text-4xl sm:text-5xl"
            >
              Draft Central
            </h2>
          </div>
          <Link
            href="/admin"
            className="text-sm text-steel underline underline-offset-4 hover:text-white focus-visible:text-white"
          >
            Admin
          </Link>
        </div>

        {drafts.length === 0 ? (
          <p className="text-sm text-steel">No drafts yet.</p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <Link
                  href={`/draft/${draft.id}`}
                  className="card-brand flex h-full flex-col gap-2 px-5 py-4 transition-colors hover:border-steel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                >
                  <span className="type-display text-xl">{draft.name}</span>
                  <span className="text-sm uppercase tracking-wide text-steel">
                    {draft.status}
                  </span>
                  <span className="label-dash">VIEW BOARD →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </LeagueHub>
  );
}

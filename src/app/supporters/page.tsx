import type { Metadata } from "next";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import PatronFlame from "@/components/patron/PatronFlame";

export const metadata: Metadata = {
  title: "League Patrons — FPL",
  description: "The people whose support keeps the site and its tools running.",
};

interface PatronRow {
  username: string;
  avatar_url: string | null;
  patron_until: string;
  patron_flame: string | null;
}

/** "through Sep 2026" — the month the patronage runs to, not the exact
 *  moment, which reads like an eviction date. */
function throughLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

export default async function SupportersPage() {
  const supabase = await createServerSupabase();
  // patrons_public exposes exactly these three columns and only active
  // patrons — see the view's migration. Anon-readable on purpose: the whole
  // point of the flame is being seen wearing it.
  const { data } = await supabase
    .from("patrons_public")
    .select("username, avatar_url, patron_until, patron_flame")
    .order("patron_until", { ascending: false });
  const patrons = (data as PatronRow[] | null) ?? [];

  return (
    <main className="bg-hash mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-12 text-white sm:px-6">
      <header>
        <span className="label-dash">League Patrons</span>
        <h1 className="type-display mt-2 text-4xl sm:text-5xl">The Flame Holders</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-steel">
          Patrons cover what the league costs to run — hosting, the tools, the AI that helps build it. In
          return they carry the flame: a colour of their choosing burning on every card they own and beside
          their name on the betting leaderboards and the Gauntlet&apos;s weekly board, card backs dealt in that
          flame, gold and crimson signing ink, a second Daily Rip, a second expedition each day, the nine-slot binder with a pedestal for
          their featured card, a weekly art re-roll, a 20% dust bonus on everything they melt, and this page.
          Nothing they pay for changes a card&apos;s odds, anyone&apos;s rating, or what comes out of a pack.
        </p>
        <Link
          href="/support-devs"
          className="mt-3 inline-block text-xs text-steel underline-offset-4 hover:text-coral hover:underline"
        >
          Become a patron →
        </Link>
      </header>

      {patrons.length === 0 ? (
        <p className="text-sm text-steel">No patrons yet — the flame awaits its first holder.</p>
      ) : (
        <section aria-label="Active patrons" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {patrons.map((patron) => (
            <div key={patron.username} className="relative flex items-center gap-3 rounded-xl border border-line/60 bg-panel p-4">
              <PatronFlame flame={patron.patron_flame} radius="0.75rem" />
              {patron.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={patron.avatar_url}
                  alt=""
                  className="h-10 w-10 rounded-full border border-gold/50 object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span aria-hidden className="grid h-10 w-10 place-content-center rounded-full border border-gold/50 text-lg">
                  🔥
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{patron.username}</p>
                <p className="text-[11px] uppercase tracking-wide text-gold">
                  Patron through {throughLabel(patron.patron_until)}
                </p>
              </div>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import CompareClient from "@/components/cards/CompareClient";
import { fetchCardSeason, fetchSeasonCards } from "@/lib/cards/queries";
import { fetchStandoutKeys } from "@/lib/cards/standout";
import { drafterAccess } from "@/lib/match-draft/access";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Compare Cards — FPL",
  description: "Two player cards head to head.",
};

function firstParam(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

/** Premium (same gate as the hub): two cards side by side with the stat
 *  rows scored between them. */
export default async function CompareCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const access = await drafterAccess();
  if (!access.signedIn || !access.allowed) {
    return (
      <main className="bg-hash flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <span className="label-dash">Compare cards</span>
        <h1 className="type-display text-3xl sm:text-4xl">Premium members only</h1>
        <p className="max-w-md text-sm text-steel">
          Card comparisons are part of the premium card collection.
          {access.signedIn ? " Grab the premium role in the Discord to use them." : " Sign in with Discord to check your access."}
        </p>
        {!access.signedIn && (
          <Link href="/login?redirect=/cards/compare" className="btn-pill mt-2">
            Sign in with Discord
          </Link>
        )}
      </main>
    );
  }

  const query = await searchParams;
  const supabase = await createServerSupabase();
  const season = await fetchCardSeason(supabase);
  const standoutKeys = season ? await fetchStandoutKeys(season) : null;
  const cards = season ? await fetchSeasonCards(supabase, season, { standoutKeys }) : [];

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <header>
        <span className="label-dash">Premium · Season {season ?? "—"}</span>
        <h1 className="type-display mt-2 text-4xl">Card vs Card</h1>
        <p className="mt-3 max-w-2xl text-sm text-steel">
          Put any two cards head to head — the better number lights up green. The URL follows your
          picks, so paste it into Discord for match-night arguments.
        </p>
        <Link href="/cards" className="mt-3 inline-block text-xs text-steel underline-offset-4 hover:text-coral hover:underline">
          ← Back to the collection
        </Link>
      </header>
      <CompareClient cards={cards} initialA={firstParam(query.a)} initialB={firstParam(query.b)} />
    </main>
  );
}

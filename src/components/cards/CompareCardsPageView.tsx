import Link from "next/link";
import CompareClient from "@/components/cards/CompareClient";
import { fetchCardSeason, fetchCurrentWeekCards, type CardLeague } from "@/lib/cards/queries";
import { drafterAccess } from "@/lib/match-draft/access";
import { createServerSupabase } from "@/lib/supabase/server";

function firstParam(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

/** Premium (same gate as the hub): two cards side by side with the stat
 *  rows scored between them. */
export async function CompareCardsPageView({
  searchParams,
  league = "premier",
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
  league?: CardLeague;
}) {
  const base = league === "academy" ? "/academy/cards" : "/cards";
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
          <Link href={`/login?redirect=${base}/compare`} className="btn-pill mt-2">
            Sign in with Discord
          </Link>
        )}
      </main>
    );
  }

  const query = await searchParams;
  const supabase = await createServerSupabase();
  const season = await fetchCardSeason(supabase, league);
  const cards = season ? await fetchCurrentWeekCards(supabase, season) : [];

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label-dash">
            Premium · {league === "academy" ? "Academy" : "Premier"} · Season {season ?? "—"}
          </span>
          <h1 className="type-display mt-2 text-4xl">Card vs Card</h1>
          <p className="mt-3 max-w-2xl text-sm text-steel">
            Put any two cards head to head — the better number lights up green. The URL follows your
            picks, so paste it into Discord for match-night arguments.
          </p>
        </div>
      </header>
      <CompareClient cards={cards} initialA={firstParam(query.a)} initialB={firstParam(query.b)} basePath={`${base}/compare`} />
    </main>
  );
}

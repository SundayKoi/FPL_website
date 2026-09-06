import CompareClient from "@/components/cards/CompareClient";
import { fetchCardSeason, fetchCurrentWeekCards, type CardLeague } from "@/lib/cards/queries";
import { createServerSupabase } from "@/lib/supabase/server";
import CardsPageHeader, { cardsEyebrow } from "@/components/cards/CardsPageHeader";

function firstParam(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

/** Two cards side by side with the stat rows scored between them.
 *  Public, like every page under Browse. */
export async function CompareCardsPageView({
  searchParams,
  league = "premier",
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
  league?: CardLeague;
}) {
  const base = league === "academy" ? "/academy/cards" : "/cards";
  const query = await searchParams;
  const supabase = await createServerSupabase();
  const season = await fetchCardSeason(supabase, league);
  const cards = season ? await fetchCurrentWeekCards(supabase, season) : [];

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <CardsPageHeader eyebrow={cardsEyebrow("Browse", league, season)} title="Compare">
        Put any two cards head to head — the better number lights up green. The URL follows your picks, so
        paste it into Discord for match-night arguments.
      </CardsPageHeader>
      <CompareClient cards={cards} initialA={firstParam(query.a)} initialB={firstParam(query.b)} basePath={`${base}/compare`} />
    </main>
  );
}

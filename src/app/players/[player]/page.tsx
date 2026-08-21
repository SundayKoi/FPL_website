import Link from "next/link";
import PlayerProfile from "@/components/players/PlayerProfile";
import { resolvePlayerParam } from "@/lib/stats/resolvePlayer";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Shareable player profile URL. The param is a display name or "Name#TAG"
 * (URL-encoded); it's resolved against the stats identities the same way
 * the stats page's ?player= deep link is. A bare name that matches two
 * different tags renders a disambiguation list instead of guessing.
 */
export default async function PlayerPage({ params }: { params: Promise<{ player: string }> }) {
  const { player } = await params;
  const query = decodeURIComponent(player);
  const supabase = await createServerSupabase();

  const { data } = await supabase.from("stats_player_agg").select("summoner_name, tag");
  const identities = (data ?? []) as { summoner_name: string; tag: string }[];
  const resolved = resolvePlayerParam(identities, query);

  if (resolved) {
    return <PlayerProfile summonerName={resolved.summonerName} tag={resolved.tag} />;
  }

  // A bare name shared by several identities: list them rather than guess.
  const nameOnly = query.split("#")[0].trim().toLowerCase();
  const candidates = Array.from(
    new Map(
      identities
        .filter((row) => row.summoner_name.trim().toLowerCase() === nameOnly)
        .map((row) => [`${row.summoner_name.toLowerCase()}#${row.tag.toLowerCase()}`, row]),
    ).values(),
  );

  return (
    <main className="flex flex-1 items-center justify-center bg-hash p-8">
      <section className="card-brand max-w-md p-6 text-center">
        {candidates.length > 1 ? (
          <>
            <h1 className="type-display text-2xl text-white">Which {query}?</h1>
            <p className="mt-2 text-sm text-steel">More than one player has that name — pick one:</p>
            <ul className="mt-4 flex flex-col gap-2">
              {candidates.map((row) => (
                <li key={`${row.summoner_name}#${row.tag}`}>
                  <Link
                    href={`/players/${encodeURIComponent(`${row.summoner_name}#${row.tag}`)}`}
                    className="btn-pill inline-block px-4 py-2 text-sm"
                  >
                    {row.summoner_name}#{row.tag}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <h1 className="type-display text-2xl text-white">No stats for “{query}”</h1>
            <p className="mt-2 text-sm text-steel">
              Profiles appear once a player has games in the stats ingest. Check the spelling, or browse
              the player list.
            </p>
            <Link href="/players" className="btn-pill mt-4 inline-block px-4 py-2 text-sm">
              All players
            </Link>
          </>
        )}
      </section>
    </main>
  );
}

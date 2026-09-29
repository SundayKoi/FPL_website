import Link from "next/link";
import PlayerProfile from "@/components/players/PlayerProfile";
import { resolvePlayerParam } from "@/lib/stats/resolvePlayer";
import { createServerSupabase } from "@/lib/supabase/server";
import LeaguePageShell from "@/components/league/LeaguePageShell";

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
    <LeaguePageShell
      league="premier"
      title="Player profile"
      activeSection="players"
      description="Stats profile links are resolved against the Premier league identity records."
    >
      <section className="card-brand mx-auto max-w-xl p-6 text-center">
        {candidates.length > 1 ? (
          <>
            <h2 className="type-display text-2xl">Which {query}?</h2>
            <p className="mt-2 text-sm text-muted">More than one player has that name — pick one:</p>
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
            <h2 className="type-display text-2xl">No stats for “{query}”</h2>
            <p className="mt-2 text-sm text-muted">
              Profiles appear once a player has games in the stats ingest. Check the spelling, or browse
              the player list.
            </p>
            <Link href="/players" className="btn-pill mt-4 inline-block px-4 py-2 text-sm">
              All players
            </Link>
          </>
        )}
      </section>
    </LeaguePageShell>
  );
}

import { NextResponse } from "next/server";
import { canonicalArtChampion, fetchPlayedChampions, isPlayedChampion } from "@/lib/cards/artwork";
import { fetchChampionSkinCatalog } from "@/lib/packs/skins";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const season = params.get("season")?.trim() ?? "";
  const summonerName = params.get("summoner")?.trim() ?? "";
  const tag = params.get("tag")?.trim() ?? "";
  const requestedChampion = params.get("champion")?.trim() ?? "";
  if (!season || !summonerName || !tag || !requestedChampion) {
    return NextResponse.json({ error: "Season, identity, and champion are required." }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { data: allowed, error: permissionError } = await supabase.rpc("can_edit_card_art", {
    p_season: season,
    p_summoner: summonerName,
    p_tag: tag,
  });
  if (permissionError || allowed !== true) {
    return NextResponse.json({ error: "You may not edit this Season Card." }, { status: 403 });
  }

  const champion = canonicalArtChampion(requestedChampion);
  const played = await fetchPlayedChampions(supabase, season, summonerName, tag);
  if (!played.available) {
    return NextResponse.json({ error: "Played champions could not be verified." }, { status: 503 });
  }
  if (!isPlayedChampion(played.champions, champion)) {
    return NextResponse.json({ error: "That champion was not played in this split." }, { status: 400 });
  }

  const catalog = await fetchChampionSkinCatalog(champion);
  return NextResponse.json({ champion, available: catalog.available, skins: catalog.skins });
}

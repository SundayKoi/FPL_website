import { NextResponse } from "next/server";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { readViewerDiscordId } from "@/lib/cards/viewer";
import { fetchPatronActive } from "@/lib/patron/queries";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchChampionSkinCatalog } from "@/lib/packs/skins";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  bestOfVariantKey,
  normalizeBestOfVariantRequest,
  type BestOfVariantRequest,
} from "@/lib/season-end/variantPreview";

const SEASON_BY_LEAGUE = { premier: "S5", academy: "A1" } as const;

async function canViewVariants(client: Awaited<ReturnType<typeof createServerSupabase>>): Promise<boolean> {
  const staff = await fetchStaffTier(client);
  if (staff.isAdmin || staff.isOwner) return true;
  const discordId = await readViewerDiscordId(client);
  return Boolean(discordId && await fetchPatronActive(createBettingServiceClient(), discordId));
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const league = params.get("league");
  if (league !== "premier" && league !== "academy") {
    return NextResponse.json({ error: "A supported league is required." }, { status: 400 });
  }
  const input = normalizeBestOfVariantRequest({
    league,
    season: params.get("season") ?? "",
    summonerName: params.get("summoner") ?? "",
    tag: params.get("tag") ?? "",
    awardedChampion: params.get("champion") ?? "",
  } satisfies BestOfVariantRequest);
  if (!input.season || !input.summonerName || !input.tag || !input.awardedChampion) {
    return NextResponse.json({ error: "Season, full player identity, and awarded champion are required." }, { status: 400 });
  }
  if (input.season !== SEASON_BY_LEAGUE[league]) {
    return NextResponse.json({ error: "That season does not belong to the selected league." }, { status: 400 });
  }

  const client = await createServerSupabase();
  if (!(await canViewVariants(client))) {
    return NextResponse.json({ error: "Variant previews are available to staff and active patrons." }, { status: 403 });
  }

  const [prefsResult, catalog] = await Promise.all([
    client
      .from("card_art_prefs")
      .select("signature")
      .eq("season", input.season)
      .eq("summoner_name", input.summonerName)
      .eq("tag", input.tag)
      .maybeSingle(),
    fetchChampionSkinCatalog(input.awardedChampion),
  ]);
  const autographStatus = prefsResult.error
    ? "query-failed"
    : prefsResult.data?.signature
      ? "available"
      : "missing";

  return NextResponse.json({
    key: bestOfVariantKey(input),
    champion: input.awardedChampion,
    skins: catalog.skins,
    catalogAvailable: catalog.available,
    autograph: autographStatus === "available" ? (prefsResult.data as { signature: string }).signature : null,
    autographStatus,
  });
}

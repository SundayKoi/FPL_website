import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getInfoPageData } from "@/lib/info/resources";
import { getBettingUser } from "@/lib/betting/wallet";
import { fetchEventSummaries, fetchMarketCards } from "@/lib/betting/queries";
import { cardSlug, type PlayerCardData } from "@/lib/cards/build";
import { fetchCardSeason, fetchCurrentWeekCards, type CardLeague } from "@/lib/cards/queries";
import { fetchBangerPosts, fetchDailyBanger } from "@/lib/bangers/queries";
import { rating, type BangerPost } from "@/lib/bangers/feed";
import { createServerSupabase } from "@/lib/supabase/server";
import type { EventSummary, MarketCardData } from "@/lib/betting/types";

export type PreviewResult<T> =
  | { status: "ready"; data: T }
  | { status: "empty"; message: string }
  | { status: "unavailable"; message: string };

export interface CardPreviewData {
  card: PlayerCardData;
  count: number;
  season: string;
  selection: "own" | "random";
}

export interface BettingPreviewData {
  balance: number | null;
  event: EventSummary;
  market: MarketCardData | null;
}

export interface BangerPreviewData {
  post: BangerPost;
  score: number;
}

export interface PremiumHubSnapshot {
  league: CardLeague;
  cards: PreviewResult<CardPreviewData>;
  betting: PreviewResult<BettingPreviewData>;
  banger: PreviewResult<BangerPreviewData>;
}

export function resolvePremiumLeague(value: string | string[] | undefined): CardLeague {
  return (Array.isArray(value) ? value[0] : value) === "academy" ? "academy" : "premier";
}

/** Prefer member-owned card, then choose a live card without exposing a list. */
export function selectPreviewCard(
  cards: PlayerCardData[],
  ownedSlug: string | null,
  random: () => number = Math.random,
): { card: PlayerCardData; selection: CardPreviewData["selection"] } | null {
  const owned = ownedSlug ? cards.find((card) => card.slug === ownedSlug) : undefined;
  if (owned) return { card: owned, selection: "own" };
  if (cards.length === 0) return null;
  const index = Math.min(cards.length - 1, Math.max(0, Math.floor(random() * cards.length)));
  return { card: cards[index], selection: "random" };
}

async function loadCardPreview(
  supabase: SupabaseClient,
  league: CardLeague,
): Promise<PreviewResult<CardPreviewData>> {
  const season = await fetchCardSeason(supabase, league);
  if (!season) return { status: "empty", message: "Cards appear when this league has a rated season." };

  const cards = await fetchCurrentWeekCards(supabase, season);
  const { data: userData } = await supabase.auth.getUser();
  const viewer = userData.user;
  const { data: claimRow } = viewer
    ? await supabase
        .from("card_claims")
        .select("summoner_name, tag, status")
        .eq("profile_id", viewer.id)
        .eq("season", season)
        .eq("status", "approved")
        .limit(1)
        .maybeSingle()
    : { data: null };
  const claim = claimRow as { summoner_name: string; tag: string } | null;
  const selected = selectPreviewCard(cards, claim ? cardSlug(claim.summoner_name, claim.tag) : null);
  if (!selected) return { status: "empty", message: "No rated cards are available yet." };

  return {
    status: "ready",
    data: { card: selected.card, count: cards.length, season, selection: selected.selection },
  };
}

async function loadBettingPreview(): Promise<PreviewResult<BettingPreviewData>> {
  const [user, events, markets] = await Promise.all([
    getBettingUser(),
    fetchEventSummaries(),
    fetchMarketCards(),
  ]);
  const market = markets.find((candidate) => candidate.status === "OPEN") ?? markets[0] ?? null;
  const event =
    (market?.event_name ? events.find((candidate) => candidate.name === market.event_name) : undefined) ??
    events.find((candidate) => candidate.open_markets > 0 || candidate.has_live_pickem) ??
    events[0];
  if (!event) return { status: "empty", message: "No betting events are live right now." };
  return { status: "ready", data: { balance: user?.balance ?? null, event, market } };
}

async function loadBangerPreview(): Promise<PreviewResult<BangerPreviewData>> {
  const [daily, posts] = await Promise.all([fetchDailyBanger(), fetchBangerPosts()]);
  const post = daily ?? posts[0];
  if (!post) return { status: "empty", message: "The next take is warming up." };
  return { status: "ready", data: { post, score: rating(post) } };
}

async function safePreview<T>(load: () => Promise<PreviewResult<T>>, message: string): Promise<PreviewResult<T>> {
  try {
    return await load();
  } catch {
    return { status: "unavailable", message };
  }
}

/**
 * One server-side read surface for Premium HQ. Each feature is isolated so a
 * stale integration cannot blank the rest of the member hub.
 */
export async function loadPremiumHubSnapshot(league: CardLeague): Promise<PremiumHubSnapshot> {
  const supabase = await createServerSupabase();
  const [cards, betting, banger] = await Promise.all([
    safePreview(() => loadCardPreview(supabase, league), "Card preview is temporarily unavailable."),
    safePreview(loadBettingPreview, "Betting preview is temporarily unavailable."),
    safePreview(loadBangerPreview, "Banger Board preview is temporarily unavailable."),
  ]);
  return { league, cards, betting, banger };
}

/** Payment is intentionally loaded only by the locked gate, never by member HQ. */
export async function loadPremiumPaymentHref(): Promise<string> {
  const { resources } = await getInfoPageData();
  return resources.find((resource) => resource.slug === "payment")?.href ?? "https://www.paypal.com/paypalme/DraftFPL";
}

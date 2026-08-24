import { createServerSupabase } from "@/lib/supabase/server";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { sanitizeTweetText } from "./contentFilter";
import type { BangerPost } from "./feed";

export async function fetchBangerPosts(): Promise<BangerPost[]> {
  const supabase = await createServerSupabase();
  const service = createBettingServiceClient();
  const [{ data, error }, { data: counts }] = await Promise.all([
    supabase
    .from("banger_posts")
    .select("id, body, published_at, x_url")
    .eq("author_handle", "Stuart69Davis")
    .order("published_at", { ascending: false }),
    service.rpc("get_banger_vote_counts"),
  ]);

  if (error || !data) return [];

  const countByPost = new Map(((counts as { post_id: string; banger_votes: number; mid_votes: number; stinker_votes: number }[] | null) ?? []).map((row) => [row.post_id, row]));
  return data.map((post) => ({
    id: post.id,
    text: sanitizeTweetText(post.body),
    publishedAt: post.published_at,
    bangerVotes: countByPost.get(post.id)?.banger_votes ?? 0,
    midVotes: countByPost.get(post.id)?.mid_votes ?? 0,
    stinkerVotes: countByPost.get(post.id)?.stinker_votes ?? 0,
    url: post.x_url,
  }));
}

export type DailyBanger = BangerPost & { checkDate: string; startsAt: string; endsAt: string };

export async function fetchDailyBanger(): Promise<DailyBanger | null> {
  const service = createBettingServiceClient();
  const { data, error } = await service.rpc("get_or_create_daily_banger");
  if (error || !data?.[0]) return null;
  const row = data[0] as { check_date: string; post_id: string; body: string; published_at: string; x_url: string; starts_at: string; ends_at: string; banger_votes: number; mid_votes: number; stinker_votes: number };
  return { id: row.post_id, text: sanitizeTweetText(row.body), publishedAt: row.published_at, url: row.x_url, checkDate: row.check_date, startsAt: row.starts_at, endsAt: row.ends_at, bangerVotes: row.banger_votes, midVotes: row.mid_votes, stinkerVotes: row.stinker_votes };
}

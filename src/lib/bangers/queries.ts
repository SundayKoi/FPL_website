import { createServerSupabase } from "@/lib/supabase/server";
import { sanitizeTweetText } from "./contentFilter";
import type { BangerVote } from "./actions";
import type { BangerPost } from "./feed";

const VALID_BANGER_VOTES = new Set<BangerVote>(["banger", "mid", "stinker"]);

function parseBangerVote(value: string | null | undefined): BangerVote | null {
  return value && VALID_BANGER_VOTES.has(value as BangerVote) ? (value as BangerVote) : null;
}

export async function fetchBangerPosts(): Promise<BangerPost[]> {
  const supabase = await createServerSupabase();
  const [{ data, error }, { data: counts }] = await Promise.all([
    supabase
    .from("banger_posts")
    .select("id, body, published_at, x_url")
    .eq("author_handle", "Stuart69Davis")
    .order("published_at", { ascending: false }),
    supabase.rpc("get_banger_vote_counts"),
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

export type BangerViewerVotes = {
  postVotes: Partial<Record<string, BangerVote>>;
  dailyVote?: BangerVote;
  /** The amount actually paid for the current daily vote, when known. */
  dailyRewardAmount?: number;
};

export async function fetchBangerViewerVotes(dailyCheckDate?: string): Promise<BangerViewerVotes> {
  const empty: BangerViewerVotes = { postVotes: {} };
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return empty;

  const postVotesPromise = supabase
    .from("banger_votes")
    .select("post_id, vote")
    .eq("voter_id", user.id);
  const dailyVotePromise = dailyCheckDate
    ? supabase
        .from("daily_banger_votes")
        .select("vote, reward_amount")
        .eq("check_date", dailyCheckDate)
        .eq("voter_id", user.id)
        .maybeSingle()
    : Promise.resolve({ data: null });

  const [{ data: postRows }, { data: dailyRow }] = await Promise.all([postVotesPromise, dailyVotePromise]);
  const postVotes = Object.fromEntries(
    ((postRows as { post_id: string; vote: string }[] | null) ?? []).flatMap((row) => {
      const vote = parseBangerVote(row.vote);
      return vote ? [[row.post_id, vote] as const] : [];
    }),
  );
  const dailyVote = parseBangerVote((dailyRow as { vote?: string } | null)?.vote);
  const dailyRewardAmount = Number((dailyRow as { reward_amount?: number } | null)?.reward_amount ?? 0);

  return { postVotes, dailyVote: dailyVote ?? undefined, dailyRewardAmount: dailyRewardAmount > 0 ? dailyRewardAmount : undefined };
}

export type DailyBanger = BangerPost & { checkDate: string; startsAt: string; endsAt: string };

export async function fetchDailyBanger(): Promise<DailyBanger | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("get_or_create_daily_banger");
  if (error || !data?.[0]) return null;
  const row = data[0] as { check_date: string; post_id: string; body: string; published_at: string; x_url: string; starts_at: string; ends_at: string; banger_votes: number; mid_votes: number; stinker_votes: number };
  return { id: row.post_id, text: sanitizeTweetText(row.body), publishedAt: row.published_at, url: row.x_url, checkDate: row.check_date, startsAt: row.starts_at, endsAt: row.ends_at, bangerVotes: row.banger_votes, midVotes: row.mid_votes, stinkerVotes: row.stinker_votes };
}

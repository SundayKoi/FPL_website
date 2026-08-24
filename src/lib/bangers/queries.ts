import { createServerSupabase } from "@/lib/supabase/server";
import { sanitizeTweetText } from "./contentFilter";
import type { BangerPost } from "./feed";

export async function fetchBangerPosts(): Promise<BangerPost[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("banger_posts")
    .select("id, body, published_at, x_url")
    .eq("author_handle", "Stuart69Davis")
    .order("published_at", { ascending: false });

  if (error || !data) return [];

  return data.map((post) => ({
    id: post.id,
    text: sanitizeTweetText(post.body),
    publishedAt: post.published_at,
    bangerVotes: 0,
    midVotes: 0,
    url: post.x_url,
  }));
}

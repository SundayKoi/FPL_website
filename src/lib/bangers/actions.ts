"use server";

import { getBettingUser } from "@/lib/betting/wallet";
import { createServerSupabase } from "@/lib/supabase/server";
import { createBettingServiceClient } from "@/lib/betting/service-client";

export type BangerVote = "banger" | "mid" | "stinker";
type VoteResult = { ok: true; balance?: number; rewardAmount?: number; alreadyVoted?: boolean } | { ok: false; error: string };

export async function voteBangerPost(postId: string, vote: BangerVote): Promise<VoteResult> {
  if (!postId || !["banger", "mid", "stinker"].includes(vote)) return { ok: false, error: "Invalid vote." };
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in to rate tweets." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };
  const sessionSupabase = await createServerSupabase();
  const { error: sessionWriteError } = await sessionSupabase
    .from("banger_votes")
    .upsert({ post_id: postId, voter_id: user.profileId, vote }, { onConflict: "post_id,voter_id" });
  if (!sessionWriteError) return { ok: true };

  console.error("banger: authenticated vote write failed; attempting service-role fallback", {
    postId,
    voterId: user.profileId,
    vote,
    error: sessionWriteError.message,
  });
  const service = createBettingServiceClient();
  const { error: rpcError } = await service.rpc("vote_banger_post", { p_post_id: postId, p_voter_id: user.profileId, p_vote: vote });
  if (!rpcError) return { ok: true };
  const { error: upsertError } = await service
    .from("banger_votes")
    .upsert({ post_id: postId, voter_id: user.profileId, vote }, { onConflict: "post_id,voter_id" });
  return upsertError ? { ok: false, error: "That vote could not be saved." } : { ok: true };
}

export async function voteDailyBanger(postId: string, vote: BangerVote): Promise<VoteResult> {
  if (!postId || !["banger", "mid", "stinker"].includes(vote)) return { ok: false, error: "Invalid vote." };
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in to claim today's $200 reward, or $300 while your patron flame is active." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };
  const supabase = createBettingServiceClient();
  const { data, error } = await supabase.rpc("vote_daily_banger", { p_post_id: postId, p_voter_id: user.profileId, p_discord_id: user.discordId, p_vote: vote });
  if (error) return { ok: false, error: /already|duplicate/i.test(error.message) ? "You already voted in today's check." : "That vote could not be saved." };
  const result = (data as { balance: number; reward_amount: number; already_voted: boolean }[] | null)?.[0];
  return {
    ok: true,
    balance: result?.balance,
    rewardAmount: Number(result?.reward_amount ?? 0) || undefined,
    alreadyVoted: result?.already_voted,
  };
}

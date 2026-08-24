"use server";

import { getBettingUser } from "@/lib/betting/wallet";
import { createBettingServiceClient } from "@/lib/betting/service-client";

export type BangerVote = "banger" | "mid" | "stinker";
type VoteResult = { ok: true; balance?: number; alreadyVoted?: boolean } | { ok: false; error: string };

export async function voteBangerPost(postId: string, vote: BangerVote): Promise<VoteResult> {
  if (!postId || !["banger", "mid", "stinker"].includes(vote)) return { ok: false, error: "Invalid vote." };
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in to rate tweets." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };
  const supabase = createBettingServiceClient();
  const { error } = await supabase.rpc("vote_banger_post", { p_post_id: postId, p_voter_id: user.profileId, p_vote: vote });
  return error ? { ok: false, error: "That vote could not be saved." } : { ok: true };
}

export async function voteDailyBanger(postId: string, vote: BangerVote): Promise<VoteResult> {
  if (!postId || !["banger", "mid", "stinker"].includes(vote)) return { ok: false, error: "Invalid vote." };
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in to claim today's $100 reward." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };
  const supabase = createBettingServiceClient();
  const { data, error } = await supabase.rpc("vote_daily_banger", { p_post_id: postId, p_voter_id: user.profileId, p_discord_id: user.discordId, p_vote: vote });
  if (error) return { ok: false, error: /already|duplicate/i.test(error.message) ? "You already voted in today's check." : "That vote could not be saved." };
  const result = (data as { balance: number; already_voted: boolean }[] | null)?.[0];
  return { ok: true, balance: result?.balance, alreadyVoted: result?.already_voted };
}

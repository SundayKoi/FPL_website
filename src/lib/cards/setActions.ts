"use server";

// The one client-callable set action. Everything it needs to be trusted
// with lives in ./setClaim.ts behind "server-only"; this authenticates,
// checks membership, delegates, and revalidates.

import { revalidatePath } from "next/cache";
import { getBettingUser } from "@/lib/betting/wallet";
import { claimTeamSetFor, type ClaimSetResult } from "./setClaim";

export async function claimTeamSetAction(
  season: string,
  weekStart: string,
  teamName: string,
): Promise<ClaimSetResult> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };
  const result = await claimTeamSetFor(user.discordId, season, weekStart, teamName);
  // Only on success: a refused claim changed nothing, and busting the page
  // cache on every rejected click would make a mis-click cost a rerender
  // of the whole collection.
  if (result.ok) {
    revalidatePath("/cards/packs");
    revalidatePath("/academy/cards/packs");
  }
  return result;
}

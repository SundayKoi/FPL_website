import "server-only";
import { bettingAccess } from "@/lib/betting/access";
import { readBettingIdentity } from "@/lib/betting/wallet";

/**
 * Who is looking at the home page, in the three shapes the page cares
 * about: nobody, someone signed in without the premium role (new, or
 * lapsed), and a member. Read-only on purpose — the home page must never
 * be the reason a wallet exists — and it fails to "signed-out", which is
 * the state whose orientation block is right for anyone.
 */
export type HomeViewer = "signed-out" | "member" | "premium";

export async function homeViewer(): Promise<HomeViewer> {
  try {
    const identity = await readBettingIdentity();
    if (!identity) return "signed-out";
    const { allowed } = await bettingAccess(identity.discordId);
    return allowed ? "premium" : "member";
  } catch {
    return "signed-out";
  }
}

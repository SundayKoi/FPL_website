import { premiumAccess, type PremiumAccess } from "@/lib/premium/access";

/** Backwards-compatible shape for the public-lobby creation gate. */
export type DrafterAccess = Omit<PremiumAccess, "isAdmin">;

/**
 * Public draft creation now uses the same FPL Premium gate as the rest of
 * the hub. Lobby links themselves remain open to whoever holds them.
 */
export async function drafterAccess(): Promise<DrafterAccess> {
  const access = await premiumAccess();
  return {
    signedIn: access.signedIn,
    allowed: access.allowed,
    inconclusive: access.inconclusive,
    staff: access.staff,
  };
}

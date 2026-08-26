import { premiumAccess, type PremiumAccess } from "@/lib/premium/access";

/** Backwards-compatible name for the public-lobby creation gate. */
export type DrafterAccess = PremiumAccess;

/**
 * Public draft creation now uses the same FPL Premium gate as the rest of
 * the hub. Lobby links themselves remain open to whoever holds them.
 */
export async function drafterAccess(): Promise<DrafterAccess> {
  return premiumAccess();
}

// Tier display helpers.
//
// Lives here, not beside the components that use it, because a Server
// Component needs it too: every export of a "use client" module becomes a
// client reference on the server, so calling a plain function imported from
// one throws rather than returning a string. This module has no directive
// and no React, so both sides can call it.

/** "challenger" -> "Challenger". The tier labels in src/lib/cards/build.ts
 *  are just the capitalized key. */
export function tierLabel(tier: string): string {
  return tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : "—";
}

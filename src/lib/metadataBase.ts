/**
 * The absolute origin relative metadata URLs resolve against.
 *
 * Next needs this to turn `openGraph.images: ["/card/foo/card.png"]` into
 * the absolute URL an unfurler can actually fetch. Without it Next falls
 * back to VERCEL_URL — the per-deployment hostname, not the domain anyone
 * shares — or to http://localhost:3000, which unfurls as nothing at all.
 *
 * NEXT_PUBLIC_SITE_URL is the same canonical origin the auth flow pins
 * itself to (src/lib/auth/siteOrigin.ts), and for the same reason: the host
 * the user happens to be browsing is not a safe thing to build shared URLs
 * out of.
 */
export function resolveMetadataBase(siteUrl: string | undefined): URL | undefined {
  const canonical = siteUrl?.trim().replace(/\/+$/, "");
  if (!canonical) return undefined;
  try {
    return new URL(canonical);
  } catch {
    // A malformed env var must not take every page's metadata down with
    // it — Next's own fallback is worse than this, but it renders.
    return undefined;
  }
}

/**
 * Resolve the origin the auth flow should return users to.
 *
 * Some mobile users were landing on the *.vercel.app deployment after
 * Discord sign-in: the OAuth redirect was built from whatever host the
 * user happened to browse on, and any host missing from Supabase's
 * Redirect URLs allowlist made Supabase fall back to its Site URL (the
 * Vercel deployment). Pinning every redirect to one canonical origin —
 * NEXT_PUBLIC_SITE_URL — takes the browsing host out of the equation.
 *
 * Order: the env-configured canonical URL wins; else the proxy's
 * x-forwarded-host (the domain the user actually sees — behind Vercel's
 * proxy request.url can be an internal deployment host); else the
 * request origin.
 */
export function resolveSiteOrigin(
  envSiteUrl: string | undefined,
  forwardedHost: string | null,
  forwardedProto: string | null,
  requestOrigin: string,
): string {
  const canonical = envSiteUrl?.trim().replace(/\/+$/, "");
  if (canonical) return canonical;
  if (forwardedHost) return `${forwardedProto ?? "https"}://${forwardedHost}`;
  return requestOrigin;
}

/** The canonical client-side origin: NEXT_PUBLIC_SITE_URL, else the current page's. */
export function clientSiteOrigin(): string {
  return resolveSiteOrigin(
    process.env.NEXT_PUBLIC_SITE_URL,
    null,
    null,
    window.location.origin,
  );
}

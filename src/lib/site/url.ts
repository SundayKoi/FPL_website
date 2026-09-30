/** The site's canonical origin for links posted off-site (Discord embeds,
 * announcements). SITE_URL is the spec'd/primary name; NEXT_PUBLIC_SITE_URL
 * (the rest of the repo's canonical-origin var — see auth/siteOrigin.ts) is
 * accepted as a fallback so a deploy only has to set one of the two. */
export function siteUrl(fallback = ""): string {
  return process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? fallback;
}

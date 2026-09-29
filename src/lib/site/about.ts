export const ABOUT_DESTINATIONS = [
  { href: "/info", label: "About the league" },
  { href: "/rulebook", label: "Rules" },
  { href: "/membership", label: "Membership & support" },
  { href: "/economy", label: "Cards & currency guide" },
] as const;

export type AboutDestinationHref = (typeof ABOUT_DESTINATIONS)[number]["href"];

/** Signup is an action from the league overview, rather than another About section. */
export function currentAboutHref(pathname: string | null | undefined): AboutDestinationHref | undefined {
  if (!pathname) return undefined;
  if (pathname === "/signup") return "/info";
  return ABOUT_DESTINATIONS.find(({ href }) => pathname === href || pathname.startsWith(`${href}/`))?.href;
}

export type AdminAccess = "all-staff" | "admin" | "admin-or-owner" | "owner" | "broadcaster";
export type AdminContext = "league-season" | "league" | "global" | "domain";

export type AdminNavigationItem = {
  label: string;
  href: string;
  context: AdminContext;
  access?: AdminAccess;
};

export type AdminNavigationGroup = {
  label: string;
  items: AdminNavigationItem[];
};

/**
 * One route inventory drives the desktop and mobile workspace navigation.
 * Page and action authorization remains in each destination.
 */
export const ADMIN_NAVIGATION: AdminNavigationGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Overview", href: "/admin", context: "league-season", access: "all-staff" },
      { label: "Reviews", href: "/admin/reviews", context: "league-season", access: "admin-or-owner" },
      { label: "Card ownership", href: "/admin/claims", context: "league-season", access: "admin" },
      { label: "Roster identity", href: "/admin/reviews/identity", context: "league-season", access: "admin-or-owner" },
    ],
  },
  {
    label: "League",
    items: [
      { label: "Schedule", href: "/admin/league/schedule", context: "league-season", access: "admin" },
      { label: "Signups", href: "/admin/league/signups", context: "global", access: "admin" },
      { label: "Players", href: "/admin/league/players", context: "league", access: "admin-or-owner" },
      { label: "Teams & rosters", href: "/admin/league/teams", context: "league", access: "admin-or-owner" },
      { label: "Drafts", href: "/admin/league/drafts", context: "global", access: "owner" },
    ],
  },
  {
    label: "Content & rewards",
    items: [
      { label: "Content & broadcast", href: "/admin/content", context: "global", access: "broadcaster" },
      { label: "Cards & rewards", href: "/admin/cards", context: "global", access: "owner" },
      { label: "Season’s End", href: "/admin/seasons-end", context: "league", access: "admin-or-owner" },
      { label: "The Send-off", href: "/admin/sendoff", context: "league", access: "admin-or-owner" },
      { label: "On Air", href: "/admin/on-air", context: "league-season", access: "admin-or-owner" },
      { label: "Expedition seasons", href: "/admin/expeditions", context: "domain", access: "admin-or-owner" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Betting", href: "/admin/betting", context: "domain", access: "admin" },
      { label: "Analytics", href: "/admin/analytics", context: "global", access: "admin-or-owner" },
      { label: "Staff access", href: "/admin/access", context: "global", access: "owner" },
      { label: "Design lab", href: "/admin/design", context: "domain", access: "admin-or-owner" },
      { label: "All tools", href: "/admin/tools", context: "domain", access: "admin-or-owner" },
    ],
  },
];

export function adminNavigationItemIsActive(pathname: string, item: AdminNavigationItem) {
  if (item.href === "/admin") return pathname === "/admin";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

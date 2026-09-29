import type { LeagueView } from "@/lib/league/context";

export type PlayDestinationKey =
  | "premium"
  | "betting"
  | "daily-stu"
  | "fpldle"
  | "higher-lower"
  | "guess-the-card";

export type PlayDestination = {
  key: PlayDestinationKey;
  label: string;
  href: string;
  badge?: string;
};

export function playDestinationHref(key: PlayDestinationKey, league: LeagueView): string {
  const prefix = league === "academy" ? "/academy" : "";
  switch (key) {
    case "premium":
      return league === "academy" ? "/premium?league=academy" : "/premium";
    case "betting":
      return "/betting";
    case "daily-stu":
      return "/bangers";
    case "fpldle":
      return `${prefix}/fpldle`;
    case "higher-lower":
      return `${prefix}/higher-lower`;
    case "guess-the-card":
      return `${prefix}/guess-the-card`;
  }
}

export function getPlayDestinations(
  league: LeagueView,
  includeAdminTest = false,
): PlayDestination[] {
  const keys: PlayDestinationKey[] = [
    "premium",
    "betting",
    "daily-stu",
    "fpldle",
    "higher-lower",
  ];
  if (includeAdminTest) keys.push("guess-the-card");

  const labels: Record<PlayDestinationKey, string> = {
    premium: "Premium HQ",
    betting: "Betting",
    "daily-stu": "The Daily Stu",
    fpldle: "FPL'dle",
    "higher-lower": "Higher or Lower",
    "guess-the-card": "Guess the Card",
  };

  return keys.map((key) => ({
    key,
    label: labels[key],
    href: playDestinationHref(key, league),
    ...(key === "guess-the-card" ? { badge: "Admin test" } : {}),
  }));
}

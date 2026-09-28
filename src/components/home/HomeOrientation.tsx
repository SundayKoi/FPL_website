import Link from "next/link";
import { homeShortcuts } from "@/lib/home/shortcuts";
import type { HomeViewer } from "@/lib/home/viewer";
import type { LeagueView } from "@/lib/league/context";
import { leaguePath } from "@/lib/league/links";
import type { FixtureRow } from "@/lib/schedule/types";
import { PREMIUM_NAME, PREMIUM_PRICE_LABEL } from "@/lib/site/discord";
import type { HomeAppearance } from "./appearance";
import styles from "./HomeWorkspace.module.css";

/** "Mon, Sep 7 · 8:00 PM ET" — the league keeps Eastern time everywhere. */
function whenLabel(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" })} · ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET`;
}

function ThirdDoor({
  door,
}: {
  door: { eyebrow: string; title: string; body: string; href: string; cta: string; secondary: { href: string; label: string } };
}) {
  return (
    <div className="rounded-lg border border-coral/50 bg-coral/5 p-4" data-testid="home-third-door">
      <span className="label-dash text-coral">{door.eyebrow}</span>
      <span className="mt-1 block text-lg font-semibold text-white">{door.title}</span>
      <span className="mt-1 block text-sm leading-6 text-muted">{door.body}</span>
      <span className="mt-3 flex flex-wrap items-center gap-3">
        <Link href={door.href} className="btn-coral px-4 py-2 text-xs uppercase tracking-wide">
          {door.cta}
        </Link>
        <Link href={door.secondary.href} className="text-sm text-action-text underline-offset-4 hover:underline">
          {door.secondary.label}
        </Link>
      </span>
    </div>
  );
}

/**
 * The first screen of the home page: what FPL is, this week's game, and
 * three doors. The page used to open on a ticker and a scoreboard with no
 * heading anywhere, and every visitor saw the same thing; the third door
 * here is the one that changes with who is looking — sign in, get the
 * role, or go to your things.
 */
export default function HomeOrientation({
  league,
  viewer,
  fixture,
  seasonLabel,
  appearance = "legacy",
  workspacePart = "full",
}: {
  league: LeagueView;
  viewer: HomeViewer;
  /** This week's featured fixture, if the schedule has one. */
  fixture: FixtureRow | null;
  seasonLabel?: string | null;
  appearance?: HomeAppearance;
  /** Split the editorial intro from its audience-specific destinations. */
  workspacePart?: "intro" | "supporting" | "full";
}) {
  const workspace = appearance === "workspace";
  const academy = league === "academy";
  const cardsBase = academy ? "/academy/cards" : "/cards";
  const premiumHref = academy ? "/premium?league=academy" : "/premium";
  const when = whenLabel(fixture?.scheduled_at ?? null);
  const played = fixture !== null && fixture.score_a !== null && fixture.score_b !== null;

  // The third door changes with who is looking. The legacy layout shows
  // it only to signed-out visitors (signed-in ones get their shortcuts);
  // the workspace layout shows it to everyone below the intro.
  const thirdDoor =
    viewer === "premium"
      ? {
          eyebrow: "You're in",
          title: "Open Premium HQ",
          body: "Your cards, your wallet, today's games and everything else the role opens, in one place.",
          href: premiumHref,
          cta: "Premium HQ →",
          secondary: { href: `${cardsBase}/collection`, label: "Your collection" },
        }
      : viewer === "member"
        ? {
            eyebrow: "Signed in",
            title: `Get ${PREMIUM_NAME}`,
            body: `A one-off ${PREMIUM_PRICE_LABEL} Discord role opens the cards, the betting and the daily games. Had it before? Everything you owned is still here.`,
            href: "/membership",
            cta: "What it is and how to get it →",
            secondary: { href: `${cardsBase}/browse`, label: "Just browse for now" },
          }
        : {
            eyebrow: "New here?",
            title: "Sign in with Discord",
            body: `Following the league is free. Signing in is how the site knows who you are; ${PREMIUM_NAME} is what opens the cards and the betting.`,
            href: "/login",
            cta: "Sign in →",
            secondary: { href: "/membership", label: `What ${PREMIUM_NAME} is` },
          };

  const shortcuts = homeShortcuts(league, viewer);

  const map = [
    { label: "League", href: leaguePath("players", league), blurb: "Players, teams, schedule, stats" },
    { label: "Cards", href: `${cardsBase}/browse`, blurb: "Every player as a card" },
    { label: "Premium", href: premiumHref, blurb: "Betting, the show, the drafter" },
    { label: "Daily games", href: academy ? "/academy/fpldle" : "/fpldle", blurb: "One a day, reset midnight ET" },
    { label: "Info", href: "/info", blurb: "Rules, links, how to join" },
  ];

  if (workspace && workspacePart === "supporting") {
    return (
      <section className={styles.orientationSupport} aria-label="More from FPL" data-viewer={viewer}>
        <div className={styles.introDoor} data-testid="home-third-door">
          <div className="min-w-0">
            <span className={styles.eyebrow}>{thirdDoor.eyebrow}</span>
            <span className={`${styles.ink} mt-1 block text-sm font-semibold`}>{thirdDoor.title}</span>
            <span className={`${styles.muted} mt-1 block text-xs leading-5`}>{thirdDoor.body}</span>
          </div>
          <span className={styles.introDoorLinks}>
            <Link href={thirdDoor.href} className={styles.link}>{thirdDoor.cta}</Link>
            <Link href={thirdDoor.secondary.href} className={styles.link}>{thirdDoor.secondary.label}</Link>
          </span>
        </div>
        <nav aria-label="Site map" className={styles.introSecondary}>
          {map.map((entry) => (
            <Link key={entry.href} href={entry.href} className={styles.introMapLink}>
              <span>{entry.label}</span><span>{entry.blurb}</span>
            </Link>
          ))}
          <a href="#site-directory-title" className={`${styles.link} ml-auto text-xs`}>Everything on the site ↓</a>
        </nav>
      </section>
    );
  }

  if (workspace && (workspacePart === "intro" || workspacePart === "full")) {
    return (
      <section
        aria-labelledby="home-title"
        className={styles.introOpen}
        data-testid="home-orientation"
        data-viewer={viewer}
        data-appearance={appearance}
      >
        <div className={styles.introHero}>
          <div>
            <span className={styles.eyebrow}>{academy ? "FPL ACADEMY" : "FRANCHISE PREMIER LEAGUE"}{seasonLabel ? ` · ${seasonLabel}` : ""}</span>
            <h1 id="home-title" className={styles.homeHeadline}>This week in FPL</h1>
          </div>
          <p className={styles.introDescription}>
            The Franchise Premier League is a League of Legends draft league. Follow its teams, schedule, standings, and weekly player cards built from match data.
          </p>
        </div>

        {viewer === "signed-out" ? (
          <nav aria-label="Start here" className={styles.introQuickLinks}>
            <Link href={leaguePath("schedule", league)} className={styles.action}>See the schedule</Link>
            <Link href={`${cardsBase}/browse`} className={styles.introSecondaryLink}>Browse the cards</Link>
          </nav>
        ) : (
          <nav aria-label="Your shortcuts" className={styles.introQuickLinks} data-testid="home-shortcuts">
            {shortcuts.map((shortcut) => (
              <Link
                key={shortcut.label}
                href={shortcut.href}
                title={shortcut.hint}
                className={shortcut.accent ? styles.action : styles.introSecondaryLink}
              >
                <span>{shortcut.label}</span>
              </Link>
            ))}
          </nav>
        )}
      </section>
    );
  }

  return (
    <section
      aria-labelledby="home-title"
      className={workspace ? `${styles.panel} ${styles.intro}` : "card-brand overflow-hidden p-5 sm:p-8"}
      data-testid="home-orientation"
      data-viewer={viewer}
      data-appearance={appearance}
    >
      <div className={workspace ? styles.introGrid : "grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-start"}>
        <div>
          <span className={workspace ? styles.eyebrow : "label-dash"}>
            {academy ? "FPL Academy" : "Franchise Premier League"}
            {seasonLabel ? ` · ${seasonLabel}` : ""}
          </span>
          <h1 id="home-title" className={workspace ? `${styles.title} mt-3 max-w-3xl text-4xl text-balance sm:text-6xl` : "type-display mt-3 max-w-3xl text-4xl text-balance sm:text-6xl"}>
            {academy
              ? "The Academy: the second division, drafted and played the same way."
              : "A League of Legends draft league — and a card economy built on every game it plays."}
          </h1>
          <p className={`mt-4 max-w-2xl text-base leading-7 sm:text-lg ${workspace ? styles.muted : "text-muted"}`}>
            Franchises draft their rosters at auction and play a season. Every player gets a card a week, rated from
            the games; members collect them, trade them, bet on the matches and play the daily games. Anyone can
            follow along.
          </p>
          {fixture ? (
            <p className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
              <span className={workspace ? styles.eyebrow : "label-dash"}>{played ? "Latest result" : "Next up"}</span>
              <Link href={leaguePath("schedule", league)} className={workspace ? styles.link : "font-semibold text-white underline-offset-4 hover:underline"}>
                {fixture.team_a ?? "TBD"} vs {fixture.team_b ?? "TBD"}
                {played ? ` · ${fixture.score_a}–${fixture.score_b}` : ""}
              </Link>
              {!played && when ? <span className={workspace ? styles.muted : "text-muted"}>{when}</span> : null}
            </p>
          ) : null}
        </div>

        {viewer === "signed-out" ? (
          <nav aria-label="Start here" className="grid gap-3">
            <Link href={leaguePath("schedule", league)} className="group rounded-lg border border-border-subtle bg-canvas/40 p-4 transition hover:border-action-text/60">
              <span className="label-dash">The season</span>
              <span className="mt-1 block text-lg font-semibold text-white">See the schedule</span>
              <span className="mt-1 block text-sm leading-6 text-muted">Who plays whom this week, and every result so far.</span>
            </Link>
            <Link href={`${cardsBase}/browse`} className="group rounded-lg border border-border-subtle bg-canvas/40 p-4 transition hover:border-action-text/60">
              <span className="label-dash">The cards</span>
              <span className="mt-1 block text-lg font-semibold text-white">Browse the cards</span>
              <span className="mt-1 block text-sm leading-6 text-muted">Every player rated from this season, open to everyone.</span>
            </Link>
            <ThirdDoor door={thirdDoor} />
          </nav>
        ) : (
          <nav aria-label="Your shortcuts" className="grid grid-cols-2 gap-3" data-testid="home-shortcuts">
            {shortcuts.map((shortcut) => (
              <Link
                key={shortcut.label}
                href={shortcut.href}
                className={`flex min-h-24 flex-col justify-between rounded-lg border p-4 transition ${
                  shortcut.accent ? "border-coral/60 bg-coral/10 hover:border-coral" : "border-border-subtle bg-canvas/40 hover:border-action-text/60"
                }`}
              >
                <span className="text-lg font-semibold leading-tight text-white">{shortcut.label}</span>
                <span className="mt-2 text-xs leading-5 text-muted">{shortcut.hint}</span>
              </Link>
            ))}
          </nav>
        )}
      </div>

      <nav aria-label="Site map" className={workspace ? `${styles.introSecondary} text-sm` : "mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border-subtle pt-4 text-sm"}>
        {map.map((entry) => (
          <Link key={entry.href} href={entry.href} className={workspace ? `${styles.link} inline-flex items-baseline gap-1.5 no-underline` : "group inline-flex items-baseline gap-1.5 text-muted transition hover:text-white"}>
            <span className={`font-semibold ${workspace ? styles.ink : "text-white"}`}>{entry.label}</span>
            <span className={`hidden text-xs sm:inline ${workspace ? styles.muted : ""}`}>{entry.blurb}</span>
          </Link>
        ))}
        <a href="#site-directory-title" className={workspace ? `${styles.link} ml-auto text-xs` : "ml-auto text-xs text-action-text underline-offset-4 hover:underline"}>
          Everything on the site ↓
        </a>
      </nav>
    </section>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import PatronSupportModal from "@/components/premium/PatronSupportModal";
import PremiumStartHere from "@/components/premium/PremiumStartHere";
import { fmtPoints } from "@/lib/betting/format";
import { DAILY_GAME_REWARD, DAILY_STU_REWARD_SENTENCE, patronRecurring } from "@/lib/betting/daily";
import { americanOdds, displayedShareA } from "@/lib/betting/parimutuel";
import type { MarketCardData } from "@/lib/betting/types";
import type { PlayerCardData } from "@/lib/cards/build";
import type { CardLeague } from "@/lib/cards/queries";
import type { PremiumHubSnapshot, PreviewResult } from "@/lib/premium/preview";
import { playDestinationHref } from "@/lib/play/destinations";

const LEAGUES: { key: CardLeague; label: string }[] = [
  { key: "premier", label: "Premier" },
  { key: "academy", label: "Academy" },
];

type PreviewFailure<T> = Extract<PreviewResult<T>, { status: "empty" | "unavailable" }>;

function resultMessage<T>(result: PreviewFailure<T>) {
  return result.message;
}

function LeagueToggle({ league }: { league: CardLeague }) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Premium league">
      {LEAGUES.map((target) => (
        <Link
          key={target.key}
          href={target.key === "academy" ? "/premium?league=academy" : "/premium"}
          aria-current={league === target.key ? "page" : undefined}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
            league === target.key ? "bg-action-fill text-white" : "border border-border-strong bg-surface text-muted hover:border-action-text hover:text-action-text"
          }`}
        >
          {target.label}
        </Link>
      ))}
    </div>
  );
}

function PreviewFallback({ result }: { result: PreviewFailure<unknown> }) {
  return (
    <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-border-subtle bg-canvas/50 p-5 text-center text-sm text-muted">
      {resultMessage(result)}
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label-dash">{eyebrow}</span>
          <h2 className="type-display mt-2 text-2xl sm:text-3xl">{title}</h2>
        </div>
        {action}
      </div>
      {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p> : null}
    </div>
  );
}

function FeatureCard({
  eyebrow,
  title,
  description,
  href,
  children,
  external = false,
  className = "",
}: {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  children: ReactNode;
  external?: boolean;
  className?: string;
}) {
  const cardClass = `card-brand flex h-full flex-col gap-4 p-5 transition hover:border-action-text/60 ${className}`;
  const cardContent = (
    <>
      <header>
        <span className="label-dash">{eyebrow}</span>
        <h3 className="type-display mt-2 text-2xl">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
      </header>
      <div className="flex-1">{children}</div>
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-action-text">
        Open {title} {external ? "↗" : "→"}
      </span>
    </>
  );

  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cardClass}>
      {cardContent}
    </a>
  ) : (
    <Link href={href} className={cardClass}>
      {cardContent}
    </Link>
  );
}

function DraftLeaguePreview() {
  return (
    <div className="flex min-h-28 flex-col justify-between rounded-lg border border-border-subtle bg-gradient-to-br from-league-accent/15 via-canvas/70 to-league-secondary/10 p-5">
      <div className="flex items-center justify-between">
        <span className="font-display text-lg font-bold text-white">DRAFT LEAGUE</span>
        <span className="rounded-full border border-gold/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold">External</span>
      </div>
      <p className="mt-5 text-sm leading-6 text-muted">The companion league experience, linked from your Premium HQ.</p>
    </div>
  );
}

function BettingGamePreview({ market }: { market: MarketCardData | null }) {
  if (!market) {
    return (
      <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-border-subtle bg-canvas/50 p-5 text-center text-sm text-muted">
        No bettable games are open right now.
      </div>
    );
  }

  const shareA = displayedShareA(market.pool_a, market.pool_b, market.open_line_prob_a);
  const totalPool = market.pool_a + market.pool_b + market.pool_draw;
  const gameTime = new Date(market.game_at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  });

  return (
    <div className="rounded-lg border border-border-subtle bg-canvas/60 p-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 rounded border p-3" style={{ borderColor: `${market.team_a.color}66` }}>
          <span className="font-mono text-xs font-semibold" style={{ color: market.team_a.color }}>
            {market.team_a.short_code}
          </span>
          <p className="mt-2 truncate text-sm font-semibold text-white">{market.team_a.name}</p>
          <p className="mt-1 font-mono text-xs text-muted">{americanOdds(shareA)}</p>
        </div>
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">vs</span>
        <div className="min-w-0 flex-1 rounded border p-3" style={{ borderColor: `${market.team_b.color}66` }}>
          <span className="font-mono text-xs font-semibold" style={{ color: market.team_b.color }}>
            {market.team_b.short_code}
          </span>
          <p className="mt-2 truncate text-sm font-semibold text-white">{market.team_b.name}</p>
          <p className="mt-1 font-mono text-xs text-muted">{americanOdds(1 - shareA)}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3 text-xs text-muted">
        <span className={market.status === "OPEN" ? "font-semibold text-mint" : "font-semibold text-gold"}>
          {market.status === "OPEN" ? "Betting open" : "Market locked"}
        </span>
        <span>{fmtPoints(totalPool)} pool</span>
      </div>
      <p className="mt-2 truncate text-xs text-muted">
        {market.event_name} · {gameTime}
      </p>
    </div>
  );
}

function MiniHigherLowerCard({ card, concealed = false }: { card: PlayerCardData | null; concealed?: boolean }) {
  return (
    <div data-testid="higher-lower-preview-card" className="relative h-[8.25rem] w-[5.9rem] shrink-0 overflow-hidden rounded-xl">
      {card ? (
        <div className="origin-top-left scale-[0.29]">
          <PlayerCard3D card={card} interactive={false} />
        </div>
      ) : (
        <div className="flex h-full w-full flex-col justify-between rounded-xl border-2 border-league-accent/70 bg-gradient-to-br from-league-accent/20 via-canvas to-league-secondary/10 p-2">
          <span className="text-[0.45rem] font-black uppercase tracking-[0.18em] text-league-accent">{concealed ? "Challenger" : "Reference"}</span>
          <span className="self-center font-display text-2xl font-bold text-white">{concealed ? "?" : "OVR"}</span>
          <span className="text-center text-[0.45rem] font-black uppercase tracking-[0.16em] text-muted">Higher or Lower</span>
        </div>
      )}
      {concealed ? (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-canvas/55">
          <span className="rounded-full border border-league-accent/70 bg-canvas/80 px-2 py-1 font-display text-lg font-bold text-league-accent">?</span>
        </div>
      ) : null}
    </div>
  );
}

function HigherLowerPreview({ referenceCard, challengerCard }: { referenceCard: PlayerCardData | null; challengerCard: PlayerCardData | null }) {
  return (
    <div
      role="img"
      aria-label="Higher or Lower game preview"
      className="flex min-h-36 items-center justify-center overflow-hidden rounded-lg border border-border-subtle bg-gradient-to-br from-league-secondary/10 via-canvas/70 to-league-accent/10 p-3"
    >
      <div className="flex items-center gap-2">
        <MiniHigherLowerCard card={referenceCard} />
        <div className="flex shrink-0 flex-col items-center justify-center text-league-accent" aria-hidden="true">
          <span className="font-display text-2xl leading-5">↑</span>
          <span className="font-display text-2xl leading-5">↓</span>
        </div>
        <MiniHigherLowerCard card={challengerCard} concealed />
      </div>
    </div>
  );
}

export default function PremiumHub({ snapshot, isAdmin = false }: { snapshot: PremiumHubSnapshot; isAdmin?: boolean }) {
  const base = snapshot.league === "academy" ? "/academy/cards" : "/cards";
  const leagueLabel = snapshot.league === "academy" ? "Academy" : "Premier";
  const higherLowerHref = playDestinationHref("higher-lower", snapshot.league);
  const guessTheCardHref = playDestinationHref("guess-the-card", snapshot.league);
  const higherLowerPreviewCards = snapshot.cards.status === "ready"
    ? { referenceCard: snapshot.cards.data.card, challengerCard: snapshot.cards.data.challengerCard }
    : { referenceCard: null, challengerCard: null };

  return (
    <main className="page-backdrop mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-10 px-4 py-10 text-white sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <span className="label-dash">FPL Premium · {leagueLabel}</span>
          <h1 className="type-display mt-2 text-4xl sm:text-6xl">Premium HQ</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted sm:text-base">
            Your cards, match-night tools, league markets, and collector economy — live in one place.
          </p>
        </div>
        <LeagueToggle league={snapshot.league} />
      </header>

      {snapshot.start ? <PremiumStartHere start={snapshot.start} base={base} /> : null}

      <section id="daily-games" aria-labelledby="daily-games-heading" className="scroll-mt-24 flex flex-col gap-5">
        <SectionHeading eyebrow="Play today" title="Daily games" description={`FPL'dle and Higher or Lower share one $${DAILY_GAME_REWARD} reward per league and Eastern puzzle date ($${patronRecurring(DAILY_GAME_REWARD)} with an active patron flame). The Daily Stu pays a separate $${DAILY_GAME_REWARD} vote reward on its UTC check date.${isAdmin ? " Guess the Card is an admin test surface." : ""}`} />
        <h2 id="daily-games-heading" className="sr-only">Daily games</h2>
        <div className="grid gap-5 lg:grid-cols-12">
          <FeatureCard
            eyebrow="Daily puzzle"
            title="FPL'dle"
            description={`Find today's ${leagueLabel} player in five guesses.`}
            href={playDestinationHref("fpldle", snapshot.league)}
            className={isAdmin ? "lg:col-span-3" : "lg:col-span-4"}
          >
            <div className="flex min-h-28 items-center rounded-lg border border-border-subtle bg-gradient-to-br from-league-accent/15 via-canvas/70 to-league-secondary/10 p-5">
              <p className="text-sm leading-6 text-muted">
                One {leagueLabel} puzzle per day. Solve within five guesses to claim its share of today&apos;s reward.
              </p>
            </div>
          </FeatureCard>
          <FeatureCard
            eyebrow="Daily puzzle"
            title="Higher or Lower"
            description={`Read the ${leagueLabel} card, then call the challenger's OVR.`}
            href={higherLowerHref}
            className={isAdmin ? "lg:col-span-3" : "lg:col-span-4"}
          >
            <HigherLowerPreview {...higherLowerPreviewCards} />
          </FeatureCard>
          {isAdmin ? (
            // Still in admin testing: advertising it to members sent them
            // to a page that bounced them straight back here.
          <FeatureCard
              eyebrow="Daily puzzle · admin test"
              title="Guess the Card"
              description={`Reconstruct the ${leagueLabel} carry from five player guesses.`}
              href={guessTheCardHref}
              className="lg:col-span-3"
            >
              <div className="flex min-h-28 flex-col justify-between rounded-lg border border-border-subtle bg-gradient-to-br from-league-secondary/10 via-canvas/70 to-league-accent/10 p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-display text-lg font-bold text-white">?????#????</span>
                  <span className="rounded-full border border-gold/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold">Admin test</span>
                </div>
                <p className="mt-5 text-sm leading-6 text-muted">Role first. Misses unlock the champion, combat, damage, and economy rails.</p>
              </div>
            </FeatureCard>
          ) : null}
          <FeatureCard
            eyebrow="Today's community vote"
            title="The Daily Stu"
            description={DAILY_STU_REWARD_SENTENCE}
            href={playDestinationHref("daily-stu", snapshot.league)}
            className={isAdmin ? "lg:col-span-3" : "lg:col-span-4"}
          >
            {snapshot.banger.status === "ready" ? (
              <div className="rounded border border-border-subtle bg-canvas/50 p-4">
                <blockquote className="line-clamp-4 text-sm leading-6 text-white">“{snapshot.banger.data.post.text}”</blockquote>
                <p className="mt-3 text-xs text-muted">{snapshot.banger.data.score}% Banger · {snapshot.banger.data.post.bangerVotes + snapshot.banger.data.post.midVotes + snapshot.banger.data.post.stinkerVotes} votes</p>
              </div>
            ) : <PreviewFallback result={snapshot.banger} />}
            <p className="mt-3 text-xs leading-5 text-muted">FPL does not condone or endorse any posts made by Stu.</p>
          </FeatureCard>
        </div>
      </section>


      <section aria-labelledby="premium-featured-heading">
        <SectionHeading
          eyebrow="Live tools"
          title="Your premium edge"
          description="Quick reads from the same live systems behind each full feature."
          action={<PatronSupportModal />}
        />
        <h2 id="premium-featured-heading" className="sr-only">Featured Premium tools</h2>
        <div className="mt-5 grid gap-5 lg:grid-cols-12">
          <FeatureCard
            eyebrow="Your collection"
            title="Cards"
            description="Season ratings, tiers, form, champion pools, and shareable card identity."
            href={base}
            className="lg:col-span-6"
          >
            {snapshot.cards.status === "ready" ? (
              <div className="flex flex-wrap items-center gap-5 rounded-lg border border-border-subtle bg-canvas/50 p-3 sm:p-5">
                <div className="flex h-[19rem] w-[13rem] shrink-0 items-start justify-center overflow-hidden sm:w-[14rem]">
                  <div className="origin-top scale-[0.67]">
                    <PlayerCard3D card={snapshot.cards.data.card} interactive={false} />
                  </div>
                </div>
                <div className="min-w-44 flex-1">
                  <span className="label-dash">{snapshot.cards.data.selection === "own" ? "Your card" : "Featured card"}</span>
                  <p className="mt-2 font-display text-2xl font-bold text-white">{snapshot.cards.data.card.name}</p>
                  <p className="mt-1 text-sm text-muted">
                    {snapshot.cards.data.card.tier.label} · {snapshot.cards.data.card.overall} OVR · {snapshot.cards.data.count} cards in {snapshot.cards.data.season}
                  </p>
                </div>
              </div>
            ) : <PreviewFallback result={snapshot.cards} />}
          </FeatureCard>

          <FeatureCard
            eyebrow="Live markets"
            title="Betting"
            description="See your wallet and the next event worth watching."
            href="/betting"
            className="lg:col-span-3"
          >
            {snapshot.betting.status === "ready" ? (
              <div className="flex h-full flex-col justify-between rounded-lg border border-gold/30 bg-gold/5 p-4">
                <BettingGamePreview market={snapshot.betting.data.market} />
                <div className="mt-5 border-t border-gold/20 pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs uppercase tracking-[0.16em] text-muted">Betting dollars</span>
                    <p className="font-display text-2xl font-bold text-gold">
                      {snapshot.betting.data.balance === null ? "—" : fmtPoints(snapshot.betting.data.balance)}
                    </p>
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    {snapshot.betting.data.event.name} · {snapshot.betting.data.event.open_markets} open markets
                  </p>
                </div>
              </div>
            ) : <PreviewFallback result={snapshot.betting} />}
          </FeatureCard>

          <FeatureCard
            eyebrow="Match night"
            title="Match Drafter"
            description="Create a private pick / ban lobby with secret captain links and live spectator mode."
            href="/drafter"
            className="lg:col-span-6"
          >
            <div className="flex min-h-28 items-center rounded-lg border border-border-subtle bg-canvas/60 p-5">
              <p className="text-sm leading-6 text-muted">
                Secret team links, ready checks, change requests, and live spectator view — all in one
                match-night workspace.
              </p>
            </div>
          </FeatureCard>

          <FeatureCard
            eyebrow="Companion league"
            title="Draft League"
            description="Jump to the external Draft League experience from the same Premium launchpad."
            href="https://www.draftleague.lol/"
            external
            className="lg:col-span-6"
          >
            <DraftLeaguePreview />
          </FeatureCard>
        </div>
      </section>

      <div className="accent-rule" aria-hidden="true" />
    </main>
  );
}

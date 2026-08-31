import Link from "next/link";
import type { ReactNode } from "react";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import PatronSupportModal from "@/components/premium/PatronSupportModal";
import { fmtPoints } from "@/lib/betting/format";
import { americanOdds, displayedShareA } from "@/lib/betting/parimutuel";
import type { MarketCardData } from "@/lib/betting/types";
import type { PlayerCardData } from "@/lib/cards/build";
import type { CardLeague } from "@/lib/cards/queries";
import type { PremiumHubSnapshot, PreviewResult } from "@/lib/premium/preview";

const LEAGUES: { key: CardLeague; label: string }[] = [
  { key: "premier", label: "Premier" },
  { key: "academy", label: "Academy" },
];

const PREMIUM_LINKS = [
  { label: "Player Cards", href: "/cards", note: "Living ratings for every player" },
  { label: "Betting Exchange", href: "/betting", note: "Markets, pick'em, and wallet" },
  { label: "The Daily Stu", href: "/bangers", note: "Judge the league's hottest takes" },
  { label: "Match Drafter", href: "/drafter", note: "Run a private pick / ban lobby" },
] as const;

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
            league === target.key ? "bg-coral text-navy" : "border border-line bg-panel text-steel hover:text-white"
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
    <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-line bg-navy/50 p-5 text-center text-sm text-steel">
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
      {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-steel">{description}</p> : null}
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
  const cardClass = `card-brand flex h-full flex-col gap-4 p-5 transition hover:border-coral/60 ${className}`;
  const cardContent = (
    <>
      <header>
        <span className="label-dash">{eyebrow}</span>
        <h3 className="type-display mt-2 text-2xl">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-steel">{description}</p>
      </header>
      <div className="flex-1">{children}</div>
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-coral">
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
    <div className="flex min-h-28 flex-col justify-between rounded-lg border border-line bg-gradient-to-br from-coral/15 via-navy/70 to-gold/10 p-5">
      <div className="flex items-center justify-between">
        <span className="font-display text-lg font-bold text-white">DRAFT LEAGUE</span>
        <span className="rounded-full border border-gold/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold">External</span>
      </div>
      <p className="mt-5 text-sm leading-6 text-steel">The companion league experience, linked from your Premium HQ.</p>
    </div>
  );
}

function BettingGamePreview({ market }: { market: MarketCardData | null }) {
  if (!market) {
    return (
      <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-line bg-navy/50 p-5 text-center text-sm text-steel">
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
    <div className="rounded-lg border border-line bg-navy/60 p-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 rounded border p-3" style={{ borderColor: `${market.team_a.color}66` }}>
          <span className="font-mono text-xs font-semibold" style={{ color: market.team_a.color }}>
            {market.team_a.short_code}
          </span>
          <p className="mt-2 truncate text-sm font-semibold text-white">{market.team_a.name}</p>
          <p className="mt-1 font-mono text-xs text-steel">{americanOdds(shareA)}</p>
        </div>
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-steel">vs</span>
        <div className="min-w-0 flex-1 rounded border p-3" style={{ borderColor: `${market.team_b.color}66` }}>
          <span className="font-mono text-xs font-semibold" style={{ color: market.team_b.color }}>
            {market.team_b.short_code}
          </span>
          <p className="mt-2 truncate text-sm font-semibold text-white">{market.team_b.name}</p>
          <p className="mt-1 font-mono text-xs text-steel">{americanOdds(1 - shareA)}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs text-steel">
        <span className={market.status === "OPEN" ? "font-semibold text-mint" : "font-semibold text-gold"}>
          {market.status === "OPEN" ? "Betting open" : "Market locked"}
        </span>
        <span>{fmtPoints(totalPool)} pool</span>
      </div>
      <p className="mt-2 truncate text-xs text-steel">
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
        <div className="flex h-full w-full flex-col justify-between rounded-xl border-2 border-coral/70 bg-gradient-to-br from-coral/20 via-navy to-cyan/10 p-2">
          <span className="text-[0.45rem] font-black uppercase tracking-[0.18em] text-coral">{concealed ? "Challenger" : "Reference"}</span>
          <span className="self-center font-display text-2xl font-bold text-white">{concealed ? "?" : "OVR"}</span>
          <span className="text-center text-[0.45rem] font-black uppercase tracking-[0.16em] text-steel">Higher or Lower</span>
        </div>
      )}
      {concealed ? (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-navy/55">
          <span className="rounded-full border border-coral/70 bg-navy/80 px-2 py-1 font-display text-lg font-bold text-coral">?</span>
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
      className="flex min-h-36 items-center justify-center overflow-hidden rounded-lg border border-line bg-gradient-to-br from-cyan/10 via-navy/70 to-coral/10 p-3"
    >
      <div className="flex items-center gap-2">
        <MiniHigherLowerCard card={referenceCard} />
        <div className="flex shrink-0 flex-col items-center justify-center text-coral" aria-hidden="true">
          <span className="font-display text-2xl leading-5">↑</span>
          <span className="font-display text-2xl leading-5">↓</span>
        </div>
        <MiniHigherLowerCard card={challengerCard} concealed />
      </div>
    </div>
  );
}

export default function PremiumHub({ snapshot }: { snapshot: PremiumHubSnapshot }) {
  const base = snapshot.league === "academy" ? "/academy/cards" : "/cards";
  const leagueLabel = snapshot.league === "academy" ? "Academy" : "Premier";
  const fpldleHref = snapshot.league === "academy" ? "/academy/fpldle" : "/fpldle";
  const higherLowerHref = snapshot.league === "academy" ? "/academy/higher-lower" : "/higher-lower";
  const guessTheCardHref = snapshot.league === "academy" ? "/academy/guess-the-card" : "/guess-the-card";
  const higherLowerPreviewCards = snapshot.cards.status === "ready"
    ? { referenceCard: snapshot.cards.data.card, challengerCard: snapshot.cards.data.challengerCard }
    : { referenceCard: null, challengerCard: null };

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-10 px-4 py-10 text-white sm:px-6 lg:px-8">
      <aside aria-label="New feature announcement" className="rounded border border-coral/50 bg-coral/10 px-4 py-3 text-sm text-steel">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="label-dash">New feature announcement</span>
            <p className="mt-2 text-white">
              FPL&apos;dle and Higher or Lower are here: complete either daily game to claim one shared reward — $200 betting dollars, or $300 while your patron flame is active. Solve FPL&apos;dle within five guesses or take on 45 Higher or Lower rounds with unlimited replays.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link href={fpldleHref} className="rounded border border-coral/70 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-coral transition hover:bg-coral/10">
              Play FPL&apos;dle →
            </Link>
            <Link href={higherLowerHref} className="rounded border border-coral/70 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-coral transition hover:bg-coral/10">
              Play Higher or Lower →
            </Link>
          </div>
        </div>
      </aside>
      <nav aria-label="Premium destinations" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PREMIUM_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="rounded-lg border border-line bg-panel/60 p-4 transition hover:border-coral/60">
            <span className="block text-sm font-semibold text-white">{link.label}</span>
            <span className="mt-1 block text-xs text-steel">{link.note}</span>
          </Link>
        ))}
      </nav>
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <span className="label-dash">FPL Premium · {leagueLabel}</span>
          <h1 className="type-display mt-2 text-4xl sm:text-6xl">Premium HQ</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-steel sm:text-base">
            Your cards, match-night tools, league markets, and collector economy — live in one place.
          </p>
        </div>
        <LeagueToggle league={snapshot.league} />
      </header>

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
            title="Player Cards"
            description="Season ratings, tiers, form, champion pools, and shareable card identity."
            href={base}
            className="lg:col-span-6"
          >
            {snapshot.cards.status === "ready" ? (
              <div className="flex flex-wrap items-center gap-5 rounded-lg border border-line bg-navy/50 p-3 sm:p-5">
                <div className="flex h-[19rem] w-[13rem] shrink-0 items-start justify-center overflow-hidden sm:w-[14rem]">
                  <div className="origin-top scale-[0.67]">
                    <PlayerCard3D card={snapshot.cards.data.card} interactive={false} />
                  </div>
                </div>
                <div className="min-w-44 flex-1">
                  <span className="label-dash">{snapshot.cards.data.selection === "own" ? "Your card" : "Featured card"}</span>
                  <p className="mt-2 font-display text-2xl font-bold text-white">{snapshot.cards.data.card.name}</p>
                  <p className="mt-1 text-sm text-steel">
                    {snapshot.cards.data.card.tier.label} · {snapshot.cards.data.card.overall} OVR · {snapshot.cards.data.count} cards in {snapshot.cards.data.season}
                  </p>
                </div>
              </div>
            ) : <PreviewFallback result={snapshot.cards} />}
          </FeatureCard>

          <FeatureCard
            eyebrow="Live markets"
            title="Betting Exchange"
            description="See your wallet and the next event worth watching."
            href="/betting"
            className="lg:col-span-3"
          >
            {snapshot.betting.status === "ready" ? (
              <div className="flex h-full flex-col justify-between rounded-lg border border-gold/30 bg-gold/5 p-4">
                <BettingGamePreview market={snapshot.betting.data.market} />
                <div className="mt-5 border-t border-gold/20 pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs uppercase tracking-[0.16em] text-steel">Wallet</span>
                    <p className="font-display text-2xl font-bold text-gold">
                      {snapshot.betting.data.balance === null ? "—" : fmtPoints(snapshot.betting.data.balance)}
                    </p>
                  </div>
                  <p className="mt-2 text-xs text-steel">
                    {snapshot.betting.data.event.name} · {snapshot.betting.data.event.open_markets} open markets
                  </p>
                </div>
              </div>
            ) : <PreviewFallback result={snapshot.betting} />}
          </FeatureCard>

          <FeatureCard
            eyebrow="Community read"
            title="The Daily Stu"
            description="Rate the latest take and vote once a day for $200, or $300 while your patron flame is active."
            href="/bangers"
            className="lg:col-span-3"
          >
            <>
              {snapshot.banger.status === "ready" ? (
                <div className="rounded-lg border border-line bg-navy/60 p-4">
                  <blockquote className="line-clamp-4 text-sm leading-6 text-white">“{snapshot.banger.data.post.text}”</blockquote>
                  <div className="mt-5">
                    <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide">
                      <span className="text-mint">{snapshot.banger.data.score}% banger</span>
                      <span className="text-steel">{snapshot.banger.data.post.bangerVotes + snapshot.banger.data.post.midVotes + snapshot.banger.data.post.stinkerVotes} votes</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
                      <div className="h-full rounded-full bg-mint" style={{ width: `${snapshot.banger.data.score}%` }} />
                    </div>
                  </div>
                </div>
              ) : <PreviewFallback result={snapshot.banger} />}
              <p className="mt-3 text-[10px] leading-4 text-steel">
                FPL does not condone or endorse any tweets made by Stu.
              </p>
            </>
          </FeatureCard>

          <FeatureCard
            eyebrow="Match night"
            title="Match Drafter"
            description="Create a private pick / ban lobby with secret captain links and live spectator mode."
            href="/drafter"
            className="lg:col-span-6"
          >
            <div className="flex min-h-28 items-center rounded-lg border border-line bg-navy/60 p-5">
              <p className="text-sm leading-6 text-steel">
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

      <section aria-labelledby="daily-games-heading" className="flex flex-col gap-5">
        <SectionHeading
          eyebrow="Daily games"
          title="Daily games"
          description="Three daily games, one shared reward, refreshed at midnight UTC."
        />
        <h2 id="daily-games-heading" className="sr-only">Daily games</h2>
        <div className="grid gap-5 lg:grid-cols-12">
          <FeatureCard
            eyebrow="Daily puzzle"
            title="FPL'dle"
            description={`Find today's ${leagueLabel} player in five guesses.`}
            href={snapshot.league === "academy" ? "/academy/fpldle" : "/fpldle"}
            className="lg:col-span-4"
          >
            <div className="flex min-h-28 items-center rounded-lg border border-line bg-gradient-to-br from-coral/15 via-navy/70 to-gold/10 p-5">
              <p className="text-sm leading-6 text-steel">
                One shared puzzle for every {leagueLabel} Premium member, refreshed at midnight UTC.
              </p>
            </div>
          </FeatureCard>
          <FeatureCard
            eyebrow="Daily card game"
            title="Higher or Lower"
            description={`Read the ${leagueLabel} card, then call the challenger's OVR.`}
            href={higherLowerHref}
            className="lg:col-span-4"
          >
            <HigherLowerPreview {...higherLowerPreviewCards} />
          </FeatureCard>
          <FeatureCard
            eyebrow="Daily Guess the Card"
            title="Guess the Card"
            description={`Reconstruct the ${leagueLabel} carry from five player guesses.`}
            href={guessTheCardHref}
            className="lg:col-span-4"
          >
            <div className="flex min-h-28 flex-col justify-between rounded-lg border border-line bg-gradient-to-br from-cyan/10 via-navy/70 to-coral/10 p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-display text-lg font-bold text-white">?????#????</span>
                <span className="rounded-full border border-gold/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold">Admin test</span>
              </div>
              <p className="mt-5 text-sm leading-6 text-steel">Role first. Misses unlock the champion, combat, damage, and economy rails.</p>
            </div>
          </FeatureCard>
        </div>
      </section>

      <div className="accent-rule" aria-hidden="true" />
    </main>
  );
}

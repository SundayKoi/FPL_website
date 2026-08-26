import Link from "next/link";
import type { ReactNode } from "react";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import { fmtPoints } from "@/lib/betting/format";
import type { CardLeague } from "@/lib/cards/queries";
import type { PremiumHubSnapshot, PreviewResult } from "@/lib/premium/preview";

const LEAGUES: { key: CardLeague; label: string }[] = [
  { key: "premier", label: "Premier" },
  { key: "academy", label: "Academy" },
];

const PREMIUM_LINKS = [
  { label: "Player Cards", href: "/cards", note: "Living ratings for every player" },
  { label: "Betting Exchange", href: "/betting", note: "Markets, pick'em, and wallet" },
  { label: "Banger Board", href: "/bangers", note: "Judge the league's hottest takes" },
  { label: "Match Drafter", href: "/drafter", note: "Run a private pick / ban lobby" },
] as const;

const CARD_TOOLS = [
  { label: "Team Cards", href: "teams", note: "Every roster as one composite card", mark: "▦" },
  { label: "Card vs Card", href: "compare", note: "Put two players head to head", mark: "⚔" },
  { label: "Moments", href: "moments", note: "Rare single-game performances", mark: "✦" },
] as const;

const CARD_ECONOMY = [
  { label: "Open Packs", href: "packs", note: "Build a collection from weekly drops", mark: "▣" },
  { label: "Your Binder", href: "packs#binder", note: "Put six favorites on display", mark: "▤" },
  { label: "Trading Post", href: "trades", note: "Swap cards and betting dollars", mark: "⇄" },
  { label: "Fantasy", href: "fantasy", note: "Field five cards under the cap", mark: "★" },
  { label: "Card Ledger", href: "stats", note: "See what the league has pulled", mark: "⌁" },
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

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div>
      <span className="label-dash">{eyebrow}</span>
      <h2 className="type-display mt-2 text-2xl sm:text-3xl">{title}</h2>
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
  return (
    <article className={`card-brand flex h-full flex-col gap-4 p-5 ${className}`}>
      <header>
        <span className="label-dash">{eyebrow}</span>
        <h3 className="type-display mt-2 text-2xl">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-steel">{description}</p>
      </header>
      <div className="flex-1">{children}</div>
      {external ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold uppercase tracking-[0.16em] text-coral hover:text-gold"
        >
          Open {title} ↗
        </a>
      ) : (
        <Link href={href} className="text-xs font-semibold uppercase tracking-[0.16em] text-coral hover:text-gold">
          Open {title} →
        </Link>
      )}
    </article>
  );
}

function MiniLinkGrid({ items, base }: { items: readonly { label: string; href: string; note: string; mark: string }[]; base: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <Link
          key={item.href}
          href={`${base}/${item.href}`}
          className="group rounded-lg border border-line bg-navy/60 p-4 transition hover:border-coral/60 hover:bg-navy"
        >
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="text-xl text-gold">{item.mark}</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-white group-hover:text-coral">{item.label}</span>
              <span className="mt-1 block text-xs leading-5 text-steel">{item.note}</span>
            </span>
          </div>
        </Link>
      ))}
    </div>
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

function CardEconomyPreview() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg border border-gold/40 bg-gold/10 p-4 text-center">
        <div className="mx-auto h-20 w-14 rounded-md border-2 border-gold/70 bg-gradient-to-br from-gold/30 to-navy shadow-lg shadow-gold/10" />
        <span className="mt-3 block text-xs font-semibold uppercase tracking-wide text-gold">Weekly packs</span>
      </div>
      <div className="rounded-lg border border-line bg-navy/60 p-4">
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 6 }, (_, index) => <span key={index} className="aspect-[5/7] rounded border border-line bg-panel" />)}
        </div>
        <span className="mt-3 block text-xs font-semibold uppercase tracking-wide text-white">Binder shelf</span>
      </div>
      <div className="rounded-lg border border-line bg-navy/60 p-4">
        <div className="flex items-center justify-center gap-2 py-5 text-2xl text-coral">
          <span>▣</span><span>⇄</span><span>▣</span>
        </div>
        <span className="block text-center text-xs font-semibold uppercase tracking-wide text-white">Trade, field, collect</span>
      </div>
    </div>
  );
}

export default function PremiumHub({ snapshot }: { snapshot: PremiumHubSnapshot }) {
  const base = snapshot.league === "academy" ? "/academy/cards" : "/cards";
  const leagueLabel = snapshot.league === "academy" ? "Academy" : "Premier";

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-10 px-4 py-10 text-white sm:px-6 lg:px-8">
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
                  <Link href={`${base}/compare?a=${snapshot.cards.data.card.slug}`} className="mt-5 inline-flex text-xs font-semibold uppercase tracking-wide text-gold hover:text-coral">
                    Compare this card →
                  </Link>
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
                <div>
                  <span className="text-xs uppercase tracking-[0.16em] text-steel">Wallet</span>
                  <p className="mt-2 font-display text-3xl font-bold text-gold">
                    {snapshot.betting.data.balance === null ? "—" : fmtPoints(snapshot.betting.data.balance)}
                  </p>
                </div>
                <div className="mt-6 border-t border-gold/20 pt-3 text-xs text-steel">
                  <p className="font-semibold text-white">{snapshot.betting.data.event.name}</p>
                  <p className="mt-1">
                    {snapshot.betting.data.event.open_markets} open markets
                    {snapshot.betting.data.event.next_lock_at ? ` · locks ${new Date(snapshot.betting.data.event.next_lock_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" })}` : ""}
                  </p>
                </div>
              </div>
            ) : <PreviewFallback result={snapshot.betting} />}
          </FeatureCard>

          <FeatureCard
            eyebrow="Community read"
            title="Banger Board"
            description="Rate the latest take and watch the league decide if it bangs."
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

      <section aria-labelledby="card-economy-heading" className="flex flex-col gap-5">
        <SectionHeading eyebrow="Collect and play" title="Your card economy" description="Every card action, visible before you open another page." />
        <h2 id="card-economy-heading" className="sr-only">Card economy</h2>
        <CardEconomyPreview />
        <MiniLinkGrid items={CARD_ECONOMY} base={base} />
      </section>

      <section aria-labelledby="card-tools-heading" className="flex flex-col gap-5">
        <SectionHeading eyebrow="More card tools" title="Go deeper" />
        <h2 id="card-tools-heading" className="sr-only">More card tools</h2>
        <MiniLinkGrid items={CARD_TOOLS} base={base} />
      </section>

      <div className="accent-rule" aria-hidden="true" />
    </main>
  );
}

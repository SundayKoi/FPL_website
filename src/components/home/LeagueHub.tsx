import Link from "next/link";

const TWITCH_URL = "https://www.twitch.tv/franchisepremierleague";

export default function LeagueHub() {
  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-7xl px-6 py-10 sm:py-16">
        <section
          aria-labelledby="league-title"
          className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]"
        >
          <div className="flex flex-col justify-center py-5 sm:py-10">
            <span className="label-dash">FRANCHISE PREMIER LEAGUE</span>
            <h1
              id="league-title"
              className="type-display mt-3 max-w-3xl text-5xl leading-[0.9] sm:text-7xl"
            >
              The league never stops.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-steel sm:text-lg">
              Follow every draft, rivalry, and roster move in League of Legends&apos;
              competitive fantasy league.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href={TWITCH_URL}
                target="_blank"
                rel="noreferrer"
                className="btn-pill focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              >
                Watch on Twitch ↗
              </a>
              <Link
                href="/draft"
                className="rounded-full border border-steel px-5 py-2 text-sm font-semibold text-white hover:border-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              >
                Explore draft central
              </Link>
            </div>
          </div>
          <article className="card-brand flex min-h-80 flex-col justify-between overflow-hidden p-6 sm:p-8">
            <div>
              <span className="inline-flex rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-red-300">
                Live destination
              </span>
              <span className="label-dash mt-8 block">ON TWITCH</span>
              <h2 className="type-display mt-2 text-4xl">Franchise Premier League</h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-steel">
                Watch the league unfold live, from draft night to every pivotal matchup.
              </p>
            </div>
            <a
              href={TWITCH_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-8 inline-flex w-fit items-center gap-2 font-semibold text-gold hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
            >
              Visit Twitch channel <span aria-hidden>→</span>
            </a>
          </article>
        </section>
      </div>
    </main>
  );
}

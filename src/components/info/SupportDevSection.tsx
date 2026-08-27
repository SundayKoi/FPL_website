import Image from "next/image";

type Props = {
  className?: string;
};

const devs = [
  {
    name: "Dribb",
    handle: "@dribb",
    avatar: "/dribb-avatar.jpg",
    venmoLabel: "Venmo Zachari Bultman",
    venmoUrl: "https://venmo.com/u/Zachari-Bultman",
  },
  {
    name: "Spies",
    handle: "@spiesss",
    avatar: "/spies-avatar.jpg",
    venmoLabel: "Venmo Matthew Wolanski",
    venmoUrl: "https://venmo.com/u/Mwolanski1",
  },
] as const;

export default function SupportDevSection({ className = "" }: Props) {
  return (
    <section
      id="support-devs"
      aria-labelledby="support-devs-heading"
      className={`card-brand ${className} grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)] lg:items-center`}
    >
      <div>
        <div className="border-b border-line/70 pb-8">
          <span className="label-dash">THE PEOPLE BEHIND THE PLAYS</span>
          <h2 id="meet-the-devs-heading" className="font-display mt-3 text-3xl font-semibold text-white sm:text-4xl">
            Meet the Devs
          </h2>
          <div className="mt-5 grid gap-4">
            {devs.map((dev) => (
              <article key={dev.handle} className="flex items-center gap-4 rounded-xl border border-line bg-black/10 p-4">
                <Image
                  src={dev.avatar}
                  alt={`${dev.name} avatar`}
                  width={80}
                  height={80}
                  className="h-20 w-20 shrink-0 rounded-full border border-line object-cover"
                />
                <div>
                  <h3 className="font-display text-2xl font-semibold text-white">{dev.name}</h3>
                  <p className="mt-1 text-sm font-medium tracking-wide text-steel">{dev.handle}</p>
                  <a
                    href={dev.venmoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-coral transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral"
                  >
                    {dev.venmoLabel} <span aria-hidden="true">↗</span>
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-8">
          <span className="label-dash">KEEPING THE LEAGUE RUNNING</span>
          <h2 id="support-devs-heading" className="font-display mt-3 text-3xl font-semibold text-white sm:text-4xl">
            Support the Devs
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-steel sm:text-base">
            If you enjoy the league and want to help keep the site, broadcasts, and tools going,
            you can support Zachari or Matthew at Venmo or PayPal.
          </p>
          <p className="mt-3 max-w-2xl text-sm italic leading-6 text-gold sm:text-base">
            Donations will be used to cover website costs.
          </p>

          <div className="mt-6 rounded-xl border border-line bg-black/10 p-4">
            <span className="label-dash">WHAT PATRONS CARRY</span>
            <ul className="mt-3 grid gap-2 text-sm leading-6 text-steel sm:grid-cols-2">
              <li>
                <span className="font-semibold text-white">🔥 The Patron Flame</span> — pick its colour from the
                wardrobe on the packs page; it burns on every card you own, beside your name on the betting
                leaderboards, and on your chase claims in Discord. The gold, ember-lit{" "}
                <span className="text-gold">Sovereign</span> unlocks at six months.
              </li>
              <li>
                <span className="font-semibold text-white">🎴 Your own card backs</span> — your packs deal
                face-down in your flame&apos;s colours, for everyone watching the flip.
              </li>
              <li>
                <span className="font-semibold text-white">🖋 The patron pen case</span> — sign your claimed card
                in gold or crimson ink; every signed copy of you that ever mints carries it.
              </li>
              <li>
                <span className="font-semibold text-white">🃏 A second Daily Rip</span> — patrons rip twice a day.
              </li>
              <li>
                <span className="font-semibold text-white">📚 The nine-slot binder</span> — three extra display
                slots, and your slot-one card floats on a pedestal glow on your public binder page.
              </li>
              <li>
                <span className="font-semibold text-white">🎲 The weekly re-roll</span> — once a week, re-roll the
                art on one copy you own. Skin only — never rarity, foil, or ink.
              </li>
            </ul>
            <p className="mt-3 text-xs leading-5 text-steel">
              The rule behind all of it: patronage is visibility, never power. Nothing here changes a card&apos;s
              odds, a rating, or a payout — the flame marks who keeps the lights on, not who wins.
            </p>
          </div>
          <a
            href="https://www.paypal.com/paypalme/ZBultman"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-pill mt-6 inline-flex items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral"
          >
            Support via PayPal <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>

      <div className="flex justify-center lg:justify-end">
        <Image
          src="/paypal-zbultman-qr.jpg"
          alt="PayPal QR code for Zachari Bultman"
          width={1170}
          height={2532}
          sizes="(max-width: 1024px) 80vw, 24rem"
          className="h-auto max-h-[34rem] w-auto max-w-full rounded-xl border border-line object-contain"
        />
      </div>
    </section>
  );
}

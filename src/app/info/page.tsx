import Link from "next/link";
import Image from "next/image";

const infoDestinations = [
  {
    href: "/league-links",
    label: "League Links",
    description: "Payment, MasterDoc, and the shared resources captains use during the season.",
  },
  {
    href: "/rulebook",
    label: "Rulebook",
    description: "The complete formatted FPL rulebook, section index, and source document.",
  },
  {
    href: "/signup",
    label: "Sign Up",
    description: "Register for the league and get yourself into the next FPL cycle.",
  },
] as const;

export default async function InfoPage() {
  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="max-w-3xl">
          <span className="label-dash">THE LEAGUE</span>
          <h1 className="type-display mt-3 text-5xl sm:text-6xl">Info</h1>
          <hr className="accent-rule mt-5 w-48 sm:w-64" />
          <p className="mt-4 text-lg leading-8 text-steel">
            League links, official rules, and signup details live on their own pages now.
          </p>
        </header>

        <section aria-label="Info destinations" className="mt-10 grid gap-5 md:grid-cols-3">
          {infoDestinations.map((destination) => (
            <Link
              key={destination.href}
              href={destination.href}
              aria-label={destination.label}
              className="card-brand group flex h-full flex-col p-6 transition hover:border-coral/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral"
            >
              <h2 className="font-display text-3xl font-semibold text-white">{destination.label}</h2>
              <p className="mt-3 flex-1 text-sm leading-6 text-steel">{destination.description}</p>
              <span className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-coral transition group-hover:text-white">
                Open page
              </span>
            </Link>
          ))}
        </section>

        <section
          id="support-devs"
          aria-labelledby="support-devs-heading"
          className="card-brand mt-8 grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)] lg:items-center"
        >
          <div>
            <span className="label-dash">KEEPING THE LEAGUE RUNNING</span>
            <h2 id="support-devs-heading" className="font-display mt-3 text-3xl font-semibold text-white sm:text-4xl">
              Support the Devs
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-steel sm:text-base">
              If you enjoy the league and want to help keep the site, broadcasts, and tools going,
              you can support Zachari Bultman through PayPal.
            </p>
            <a
              href="https://www.paypal.com/paypalme/ZBultman"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-pill mt-6 inline-flex items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral"
            >
              Support via PayPal <span aria-hidden="true">↗</span>
            </a>
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
      </div>
    </main>
  );
}

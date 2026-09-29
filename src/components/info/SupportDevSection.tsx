import Image from "next/image";
import Link from "next/link";
import { PATRON_PAYPAL_HREF, PATRON_VENMO_LINKS } from "@/lib/patron/links";

type Props = {
  className?: string;
};

const devs = [
  {
    name: "Dribb",
    handle: "@dribb",
    avatar: "/dribb-avatar.jpg",
    venmoLabel: `Venmo ${PATRON_VENMO_LINKS[0].name}`,
    venmoUrl: PATRON_VENMO_LINKS[0].href,
  },
  {
    name: "Spies",
    handle: "@spiesss",
    avatar: "/spies-avatar.jpg",
    venmoLabel: `Venmo ${PATRON_VENMO_LINKS[1].name}`,
    venmoUrl: PATRON_VENMO_LINKS[1].href,
  },
] as const;

export default function SupportDevSection({ className = "" }: Props) {
  return (
    <section
      id="support-devs"
      aria-labelledby="support-devs-heading"
      className={`${className} scroll-mt-24 border-t border-border-subtle pt-8`}
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] lg:items-start">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-action-text">The people behind the site</p>
          <h2 id="support-devs-heading" className="mt-2 font-display text-2xl font-semibold text-white">Support the developers</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
            Optional support helps cover the site, broadcasts, and tools. These payment links support the developers directly;
            they do not register you for league play or assign the separate FPL Premium role.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {devs.map((dev) => (
              <article key={dev.handle} className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface p-4">
                <Image
                  src={dev.avatar}
                  alt={`${dev.name} avatar`}
                  width={64}
                  height={64}
                  className="h-16 w-16 shrink-0 rounded-full border border-border-subtle object-cover"
                />
                <div>
                  <h3 className="font-display text-xl font-semibold text-white">{dev.name}</h3>
                  <p className="mt-1 text-sm font-medium tracking-wide text-muted">{dev.handle}</p>
                  <a
                    href={dev.venmoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-action-text transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
                  >
                    {dev.venmoLabel} <span aria-hidden="true">↗</span>
                  </a>
                </div>
              </article>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <a href={PATRON_PAYPAL_HREF} target="_blank" rel="noopener noreferrer" className="btn-pill inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold">
              PayPal · Zachari ↗
            </a>
            {PATRON_VENMO_LINKS.map((link) => (
              <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className="btn-pill inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold">
                Venmo · {link.name} ↗
              </a>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-muted">
            If you are supporting as a patron and want a public flame listing, message a developer with your Discord username.
            Patron recognition and FPL Premium access are handled separately.
          </p>
          <p className="mt-3 text-sm">
            <Link href="#patrons" className="text-action-text underline underline-offset-4 hover:text-white">See current patrons →</Link>
          </p>
        </div>
        <details className="rounded-lg border border-border-subtle bg-surface p-4">
          <summary className="cursor-pointer text-sm font-semibold text-action-text">Show PayPal QR code</summary>
          <div className="mt-4 flex justify-center">
            <Image
              src="/paypal-zbultman-qr.jpg"
              alt="PayPal QR code for Zachari Bultman"
              width={1170}
              height={2532}
              sizes="(max-width: 1024px) 80vw, 22rem"
              className="h-auto max-h-[30rem] w-auto max-w-full rounded-lg border border-border-subtle object-contain"
            />
          </div>
        </details>
      </div>
    </section>
  );
}

import Link from "next/link";

export default function PremiumGate({ signedIn, paymentHref }: { signedIn: boolean; paymentHref: string }) {
  return (
    <main className="bg-hash flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
      <section className="card-brand flex w-full max-w-2xl flex-col items-center gap-5 p-7 sm:p-10">
        <span className="label-dash">FPL Premium</span>
        <h1 className="type-display text-4xl sm:text-5xl">Premium HQ is locked</h1>
        <p className="max-w-xl text-sm leading-7 text-muted sm:text-base">
          FPL Premium is only $10. Unlock the live card collection, betting exchange, The Daily Stu, Match
          Drafter, card economy, and more in one member hub.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <a
            href={paymentHref}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary inline-flex items-center px-5 py-3 text-sm uppercase tracking-wide"
          >
            Get FPL Premium — $10 ↗
          </a>
          {!signedIn ? (
            <Link href="/login?redirect=/premium" className="btn-pill inline-flex items-center text-sm">
              Sign in with Discord
            </Link>
          ) : null}
        </div>
        <p className="max-w-lg text-xs leading-5 text-muted">
          After payment, join the FPL Better Discord role and sign in with Discord to check access.
        </p>
      </section>
    </main>
  );
}

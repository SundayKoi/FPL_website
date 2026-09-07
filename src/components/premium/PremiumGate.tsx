import Link from "next/link";
import { DISCORD_INVITE_EXTERNAL, DISCORD_INVITE_URL, PREMIUM_NAME, PREMIUM_PRICE_LABEL } from "@/lib/site/discord";

export default function PremiumGate({ signedIn, paymentHref }: { signedIn: boolean; paymentHref: string }) {
  return (
    <main className="page-backdrop flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
      <section className="card-brand flex w-full max-w-2xl flex-col items-center gap-5 p-7 sm:p-10">
        <span className="label-dash">FPL Premium</span>
        <h1 className="type-display text-4xl sm:text-5xl">Premium HQ is locked</h1>
        <p className="max-w-xl text-sm leading-7 text-muted sm:text-base">
          {PREMIUM_NAME} is only {PREMIUM_PRICE_LABEL}, once. Unlock the live card collection, betting exchange, The Daily Stu, Match
          Drafter, card economy, and more in one member hub.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <a
            href={paymentHref}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary inline-flex items-center px-5 py-3 text-sm uppercase tracking-wide"
          >
            Get {PREMIUM_NAME} — {PREMIUM_PRICE_LABEL} ↗
          </a>
          {!signedIn ? (
            <Link href="/login?redirect=/premium" className="btn-pill inline-flex items-center text-sm">
              Sign in with Discord
            </Link>
          ) : null}
        </div>
        <p className="max-w-lg text-xs leading-5 text-muted">
          After paying, {DISCORD_INVITE_EXTERNAL ? (
            <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className="text-action-text underline-offset-4 hover:underline">
              join the league Discord ↗
            </a>
          ) : (
            <Link href={DISCORD_INVITE_URL} className="text-action-text underline-offset-4 hover:underline">
              find the league Discord
            </Link>
          )}{" "}
          and tell a staff member — they give you the {PREMIUM_NAME} role. Then sign in here with Discord.{" "}
          <Link href="/membership" className="text-action-text underline-offset-4 hover:underline">
            Premium and Patron, side by side →
          </Link>
        </p>
      </section>
    </main>
  );
}

import Link from "next/link";
import type { StartChecklist } from "@/lib/premium/preview";

interface Step {
  key: string;
  title: string;
  /** What it is for, in one line. */
  why: string;
  done: boolean;
  /** Where to do it; null when it cannot be done yet. */
  href: string | null;
  cta: string;
  /** Shown instead of a link when the step is waiting on someone else. */
  waiting?: string;
}

/**
 * The five things a new member should do, with live ticks. The closest
 * thing the site had was a three-step strip on the cards hub that showed
 * only while they owned zero cards and mentioned neither claiming nor
 * signing nor auto-dust. This stays until all five are done, then goes.
 */
export default function PremiumStartHere({ start, base }: { start: StartChecklist; base: string }) {
  const steps: Step[] = [
    {
      key: "discord",
      title: "Sign in with Discord",
      why: "It is how the site knows which wallet and which shelf are yours.",
      done: start.discordLinked,
      href: "/login?redirect=/premium",
      cta: "Sign in",
    },
    {
      key: "claim",
      title: "Claim your card",
      why: "Every player has one. Once a captain or admin confirms it is you, you pick the art and write the motto.",
      done: start.claim === "approved",
      href: start.discordLinked ? `${base}#claim` : null,
      cta: "Find your card",
      waiting: start.claim === "pending" ? "Claimed — waiting on a captain or admin to confirm" : undefined,
    },
    {
      key: "sign",
      title: "Sign it",
      why: "Draw your autograph once, and every signed copy of you that ever prints carries it.",
      done: start.signed,
      href: start.claim === "approved" && start.cardHref ? start.cardHref : null,
      cta: "Open your card",
      waiting: start.claim !== "approved" ? "After your claim is confirmed" : undefined,
    },
    {
      key: "pack",
      title: "Open your first pack",
      why: "The first pack each day is free. Five cards; the rest of the site is what you do with them.",
      done: start.packOpened,
      href: start.discordLinked ? `${base}/packs` : null,
      cta: "Rip one",
    },
    {
      key: "auto-dust",
      title: "Set an auto-dust rule",
      why: "Spare copies below a line you choose turn into betting dollars the moment they are pulled.",
      done: start.autoDust,
      href: start.discordLinked ? `${base}/collection#auto-dust` : null,
      cta: "Set the rule",
    },
  ];
  const done = steps.filter((step) => step.done).length;
  if (done === steps.length) return null;

  return (
    <section aria-labelledby="start-here-title" className="card-brand border-coral/40 p-5 sm:p-6" data-testid="premium-start-here">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="label-dash text-coral">Start here</span>
          <h2 id="start-here-title" className="type-display mt-2 text-2xl sm:text-3xl">
            Five things, then you&apos;re set
          </h2>
        </div>
        <span className="font-mono text-sm text-muted" aria-live="polite">
          {done} of {steps.length} done
        </span>
      </div>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map((step, index) => (
          <li
            key={step.key}
            data-testid={`start-step-${step.key}`}
            data-done={step.done}
            className={`flex flex-col gap-2 rounded-lg border p-4 ${step.done ? "border-mint/40 bg-mint/5" : "border-border-subtle bg-canvas/40"}`}
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold ${
                  step.done ? "bg-mint text-navy" : "border border-border-strong text-muted"
                }`}
              >
                {step.done ? "✓" : index + 1}
              </span>
              <span className={`text-sm font-semibold ${step.done ? "text-mint line-through decoration-mint/60" : "text-white"}`}>
                {step.title}
                <span className="sr-only">{step.done ? " — done" : ""}</span>
              </span>
            </div>
            <p className="text-xs leading-5 text-muted">{step.why}</p>
            {step.done ? null : step.waiting ? (
              <span className="mt-auto text-xs font-semibold text-gold">{step.waiting}</span>
            ) : step.href ? (
              <Link href={step.href} className="mt-auto text-xs font-semibold uppercase tracking-[0.14em] text-coral underline-offset-4 hover:underline">
                {step.cta} →
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

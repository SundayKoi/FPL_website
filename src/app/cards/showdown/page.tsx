import type { Metadata } from "next";
import Link from "next/link";
import CardsPageHeader from "@/components/cards/CardsPageHeader";
import ShowdownRules from "@/components/showdown/ShowdownRules";
import { BRACKETS, SEATS_MAX, STACK_SIZE } from "@/lib/showdown/config";

export const metadata: Metadata = {
  title: "Showdown — FPL",
  description: "Hold'em with the cards you collect, for betting dollars. No card is ever on the line.",
};

/**
 * Showdown's front door. Until the tables land this is the rulebook, in
 * the open, so the numbers can be argued over before anything is dealt.
 * The lobby renders here once tables exist.
 */
export default function ShowdownPage() {
  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1160px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <CardsPageHeader eyebrow="Play · Premier" title="Showdown">
        Hold&apos;em with the cards you collect. The board comes from this week&apos;s edition, your hole cards
        come from your own shelf, and the stakes are betting dollars. No card is ever on the line.
      </CardsPageHeader>

      <section aria-label="Tables" className="card-brand flex flex-col gap-2 p-5 text-sm text-steel">
        <span className="label-dash text-coral">Tables open soon</span>
        <p>
          The rules are final enough to read; the felt is being built. Tables will seat up to {SEATS_MAX},
          take a stack of {STACK_SIZE} cards under the cap, and run at {BRACKETS.low.label} and{" "}
          {BRACKETS.open.label} stakes. Read the rulebook below and say what you think in Discord.
        </p>
        <Link href="/cards/play" className="w-fit text-xs text-steel underline-offset-4 hover:text-coral hover:underline">
          ← Play
        </Link>
      </section>

      <ShowdownRules />
    </main>
  );
}

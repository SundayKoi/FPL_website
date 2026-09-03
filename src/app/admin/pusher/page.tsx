import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import PusherMockup from "@/components/pusher/PusherMockup";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { fmtPoints } from "@/lib/betting/format";
import { COIN_VALUE, DROP_COST, DROPS_PER_MINUTE, PRIZES, TARGET_RETURN } from "@/lib/pusher/config";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "The Pusher — FPL Admin",
};

/**
 * PREVIEW ONLY. A staff-gated toy of the coin pusher idea, so the feel can
 * be judged before anything is built. The physics is local and pretend;
 * nothing reads or writes; no wallet is touched.
 */
export default async function PusherPreviewPage() {
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner } = await fetchStaffTier(supabase);
  if (!isAdmin && !isOwner) redirect("/admin");

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-3">
        <Link href="/admin" className="label-dash w-fit hover:text-coral">
          ← Admin
        </Link>
        <h1 className="type-display text-4xl sm:text-5xl">The Pusher</h1>
        <p className="max-w-3xl text-sm text-steel">
          A coin pusher for betting dollars: one machine for the league, coins pile up on a shelf, a bar sweeps
          them toward the lip, and whatever falls is yours. This is a toy of it, to judge the feel. Click the
          shelf.
        </p>
        <p className="max-w-3xl text-sm text-coral">
          Preview only. The physics here is local and pretend; nothing on this page reads or writes anything.
        </p>
      </header>

      <PusherMockup />

      <section aria-labelledby="design" className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="card-brand flex flex-col gap-3 p-5 text-sm text-steel">
          <h2 id="design" className="type-display text-2xl text-white">
            How the real one would work
          </h2>
          <p>
            <strong className="text-white">One machine for the league.</strong> Everyone&apos;s coins pile up on the
            same shelf, so &ldquo;it&apos;s about to go&rdquo; is something people post, and someone can sweep the
            pile you spent ten minutes building. That is the arcade experience and what makes it social rather
            than a slot. The gentler option is a machine per bracket, or one that resets nightly.
          </p>
          <p>
            <strong className="text-white">The server settles, the browser animates.</strong> Two browsers never
            simulate the same physics, and a client-side result is a lie waiting to happen. So the shelf is a
            small deterministic model on the server — columns with coin heights, a drop lands in a column chosen by
            your aim plus a seeded roll, each drop shoves that column forward by a rule, anything past the lip falls,
            anything past the side walls is lost — and the browser plays an animation that ends in the settled
            state. The Gauntlet&apos;s discipline: seed first, then resolve. Money never touches the odds.
          </p>
          <p>
            <strong className="text-white">What falls off.</strong> Coins are dollars. Dust chunks are the mid
            prize. A pack token is the one people chase. A card on the shelf mints a copy through the same
            print-run path a pack uses, with provenance &ldquo;pusher&rdquo; — a new mint door, so it gets the same
            counters and the same rarity gate or it is a back door.
          </p>
          <p>
            <strong className="text-white">Texture.</strong> Aim left, centre or right; timing against the bar&apos;s
            cycle; side walls that eat coins, visibly; a bonus lane at the back that only fills on a perfect drop
            and pays out on overflow; a few drops a minute per person so a script cannot drain it.
          </p>
        </div>
        <div className="card-brand flex flex-col gap-2 p-5 text-sm">
          <span className="label-dash">Numbers to argue about</span>
          <ul className="flex flex-col gap-2">
            <li className="flex justify-between gap-2 border-b border-line pb-2">
              <span className="text-steel">A drop</span>
              <span className="font-semibold text-white">{fmtPoints(DROP_COST)}</span>
            </li>
            <li className="flex justify-between gap-2 border-b border-line pb-2">
              <span className="text-steel">A coin on the shelf</span>
              <span className="font-semibold text-white">{fmtPoints(COIN_VALUE)}</span>
            </li>
            {Object.values(PRIZES).map((prize) => (
              <li key={prize.kind} className="flex justify-between gap-2 border-b border-line pb-2">
                <span className="text-steel">{prize.label}</span>
                <span className="font-semibold text-white">worth {fmtPoints(prize.value)}</span>
              </li>
            ))}
            <li className="flex justify-between gap-2 border-b border-line pb-2">
              <span className="text-steel">Long-run return</span>
              <span className="font-semibold text-white">{Math.round(TARGET_RETURN * 100)}%</span>
            </li>
            <li className="flex justify-between gap-2 pb-2">
              <span className="text-steel">Drops per person per minute</span>
              <span className="font-semibold text-white">{DROPS_PER_MINUTE}</span>
            </li>
          </ul>
          <p className="mt-2 text-xs text-steel">
            Two decisions shape everything else: whether a card can ever be a prize, and whether the machine is
            one for the league or resets. About the size of Higher-Lower plus a canvas: the model and the money
            doors, then the machine and the Play entry, then tokens, cards and a Discord command.
          </p>
        </div>
      </section>
    </main>
  );
}

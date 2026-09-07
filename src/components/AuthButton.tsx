import Link from "next/link";
import { fmtPoints } from "@/lib/betting/format";
import { getBettingUser } from "@/lib/betting/wallet";
import { signOut } from "@/lib/auth/actions";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function AuthButton() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <Link href="/login" className="btn-pill text-sm">Sign in</Link>;
  const [{ data: profile }, bettingUser] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
    getBettingUser().catch(() => null),
  ]);
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="hidden text-sm text-muted sm:inline">
          {profile?.display_name ?? user.email}
        </span>
        {bettingUser?.allowed ? (
          <Link
            href="/economy"
            title="Your betting dollars — what they buy and every way to earn more"
            className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-xs font-semibold text-gold transition hover:bg-gold/20"
            aria-label={`Premium wallet balance ${fmtPoints(bettingUser.balance)}`}
          >
            {fmtPoints(bettingUser.balance)}
          </Link>
        ) : (
          // Signed in without the role — new, or lapsed. The chip used to
          // simply vanish, which told a lapsed member nothing.
          <Link
            href="/premium"
            className="rounded-full border border-border-strong px-2.5 py-1 text-xs font-semibold text-muted transition hover:border-gold/60 hover:text-gold"
            data-testid="get-premium-chip"
          >
            Get Premium
          </Link>
        )}
      </div>
      <form action={signOut}>
        <button type="submit" className="btn-pill text-sm">Sign out</button>
      </form>
    </div>
  );
}

// The patron perk list, rendered. Two shapes, one source (lib/patron/perks):
// the full list for the support desk, and a short one for the cards hub
// where the audience is already holding the cards these perks decorate.

import Link from "next/link";
import { HEADLINE_PATRON_PERKS, PATRON_FAIRNESS_NOTE, PATRON_PERKS } from "@/lib/patron/perks";

export default function PatronPerks({
  variant = "full",
  className = "",
}: {
  variant?: "full" | "compact";
  className?: string;
}) {
  const compact = variant === "compact";
  const perks = compact ? HEADLINE_PATRON_PERKS : PATRON_PERKS;

  return (
    <div className={`rounded-xl border border-border-subtle bg-black/10 p-4 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="label-dash">{compact ? "The Patron Flame" : "What patrons carry"}</span>
        {compact ? (
          <Link
            href="/support-devs"
            className="text-xs text-muted underline-offset-4 hover:text-action-text hover:underline"
          >
            All {PATRON_PERKS.length} perks →
          </Link>
        ) : null}
      </div>

      {compact ? (
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Patrons cover what the league costs to run — hosting, the tools, the broadcasts. In return they
          carry the flame:
        </p>
      ) : null}

      <ul className={`mt-3 grid gap-2 text-sm leading-6 text-muted ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2"}`}>
        {perks.map((perk) => (
          <li key={perk.key}>
            <span className="font-semibold text-white">
              <span aria-hidden>{perk.icon}</span> {perk.title}
            </span>
            {" — "}
            {perk.blurb}
            {perk.href ? (
              <>
                {" "}
                <Link href={perk.href} className="text-coral underline-offset-4 hover:underline">
                  Have a look →
                </Link>
              </>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs leading-5 text-muted">{PATRON_FAIRNESS_NOTE}</p>

      {compact ? (
        <div className="mt-3 flex flex-wrap gap-3">
          <Link href="/support-devs" className="btn-pill px-4 py-1.5 text-xs">
            Become a patron
          </Link>
          <Link
            href="/supporters"
            className="text-xs text-muted underline-offset-4 hover:text-action-text hover:underline"
          >
            See the Flame Holders →
          </Link>
        </div>
      ) : null}
    </div>
  );
}

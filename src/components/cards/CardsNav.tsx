// Where to go from the card hub.
//
// This was nine identical coral pills in a row. Every destination shouted
// at the same volume, none of them said what they were for, and finding
// the one you wanted meant reading all nine — which is the failure mode of
// a flat list once it outgrows about four items.
//
// Grouped by intent instead, because that is how someone arrives: they
// want to LOOK at cards, or to COLLECT them, or to play with them. Each
// destination gets a line explaining itself, so the label no longer has to
// carry the whole meaning.

import Link from "next/link";

interface NavItem {
  label: string;
  href: string;
  blurb: string;
  /** The one gold destination — moments are not a normal page. */
  accent?: boolean;
  /** Rendered after the label, for the claims queue. */
  badge?: number;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

export function cardsNavGroups({
  base,
  showClaims = false,
  pendingClaims = 0,
}: {
  base: string;
  showClaims?: boolean;
  pendingClaims?: number;
}): NavGroup[] {
  const groups: NavGroup[] = [
    {
      title: "Browse",
      items: [
        { label: "Team Cards", href: `${base}/teams`, blurb: "Every roster as one composite card" },
        { label: "Card vs Card", href: `${base}/compare`, blurb: "Put two players side by side" },
        { label: "Moments", href: `${base}/moments`, blurb: "The rarest single games of the season", accent: true },
      ],
    },
    {
      title: "Collect",
      items: [
        { label: "Packs", href: `${base}/packs`, blurb: "Open a pack from any week's edition" },
        { label: "Your Binder", href: `${base}/packs#binder`, blurb: "Six cards on public display" },
        { label: "Trades", href: `${base}/trades`, blurb: "Swap copies with other collectors" },
      ],
    },
    {
      title: "Play",
      items: [
        { label: "Fantasy", href: `${base}/fantasy`, blurb: "Field five cards under the salary cap" },
        { label: "Ledger", href: `${base}/stats`, blurb: "What the league has opened and pulled" },
      ],
    },
  ];

  if (showClaims) {
    groups[2].items.push({
      label: "Claims",
      href: "/cards/claims",
      blurb: "Approve players claiming their own card",
      badge: pendingClaims > 0 ? pendingClaims : undefined,
    });
  }

  return groups;
}

export default function CardsNav(props: { base: string; showClaims?: boolean; pendingClaims?: number }) {
  const groups = cardsNavGroups(props);

  return (
    <nav aria-label="Card sections" className="grid gap-4 md:grid-cols-3">
      {groups.map((group) => (
        <section key={group.title} className="card-brand flex flex-col gap-2 p-4">
          <span className="label-dash">{group.title}</span>
          <ul className="flex flex-col gap-1.5">
            {group.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`group flex flex-col rounded-lg border border-transparent px-3 py-2 transition hover:border-line hover:bg-navy/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral ${
                    item.accent ? "hover:border-gold/60" : ""
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`text-sm font-semibold ${
                        item.accent ? "text-gold" : "text-white group-hover:text-coral"
                      }`}
                    >
                      {item.label}
                    </span>
                    {item.badge ? (
                      <span className="rounded-full bg-coral px-1.5 py-0.5 text-[10px] font-black leading-none text-navy">
                        {item.badge}
                      </span>
                    ) : null}
                    <span aria-hidden className="ml-auto text-xs text-steel transition group-hover:translate-x-0.5">
                      →
                    </span>
                  </span>
                  <span className="mt-0.5 text-xs leading-5 text-steel">{item.blurb}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

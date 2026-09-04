import type { ReactNode } from "react";
import CardsTabs from "@/components/cards/CardsTabs";
import { cardsShelfStatus } from "@/lib/cards/shelfStatus";

/** The academy cards pages, under the same tab bar as premier's. The
 *  "back to Premium HQ" link that used to sit here is gone: Cards has its
 *  own place in the top navigation now, and Premium HQ is a menu item. */
export default async function AcademyCardsLayout({ children }: { children: ReactNode }) {
  // The wallet and the inbox ride on every cards page: money is spent on
  // four of them, and an offer waiting is worth a badge wherever you are.
  const status = await cardsShelfStatus("academy");
  return (
    <div className="flex flex-1 flex-col">
      <CardsTabs league="academy" balance={status.balance} offers={status.offers} forks={status.forks} />
      {children}
    </div>
  );
}

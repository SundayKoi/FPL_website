import type { ReactNode } from "react";
import CardsTabs from "@/components/cards/CardsTabs";

/** The academy cards pages, under the same tab bar as premier's. The
 *  "back to Premium HQ" link that used to sit here is gone: Cards has its
 *  own place in the top navigation now, and Premium HQ is a menu item. */
export default function AcademyCardsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <CardsTabs league="academy" />
      {children}
    </div>
  );
}

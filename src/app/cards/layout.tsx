import type { ReactNode } from "react";
import CardsTabs from "@/components/cards/CardsTabs";

/** Every premier cards page wears the same tab bar, so the section can be
 *  crossed sideways instead of only through the hub. The academy mirror
 *  (src/app/academy/cards/layout.tsx) does the same with its own base. */
export default function CardsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <CardsTabs league="premier" />
      {children}
    </div>
  );
}

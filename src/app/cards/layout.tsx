import type { ReactNode } from "react";
import CardsTabs from "@/components/cards/CardsTabs";
import styles from "@/components/cards/CardsPageShell.module.css";
import { cardsShelfStatus } from "@/lib/cards/shelfStatus";

/** Every premier cards page wears the same tab bar, so the section can be
 *  crossed sideways instead of only through the hub. The academy mirror
 *  (src/app/academy/cards/layout.tsx) does the same with its own base. */
export default async function CardsLayout({ children }: { children: ReactNode }) {
  // The wallet and the inbox ride on every cards page: money is spent on
  // four of them, and an offer waiting is worth a badge wherever you are.
  const status = await cardsShelfStatus("premier");
  return (
    <div className={styles.page} data-league="premier">
      <CardsTabs league="premier" balance={status.balance} offers={status.offers} forks={status.forks} />
      {children}
    </div>
  );
}

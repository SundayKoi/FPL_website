import Link from "next/link";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import type { PlayerCardData } from "@/lib/cards/build";
import styles from "./HomeWorkspace.module.css";

export default function HomeCardsPromo({
  cards,
  basePath = "/cards",
}: {
  cards: PlayerCardData[];
  basePath?: string;
}) {
  const examples = [...cards].sort((a, b) => b.overall - a.overall).slice(0, 3);

  return (
    <section className={styles.cardsPromo} aria-labelledby="home-cards-promo-title">
      <div className={`${styles.bandInner} ${styles.cardsPromoInner}`}>
        <div>
          <span className={styles.promoEyebrow}>FPL cards</span>
          <h2 id="home-cards-promo-title">Explore FPL cards.</h2>
          <p>Real player cards, built from this week&apos;s league stats.</p>
          <Link href={`${basePath}/browse`} className={styles.cardsPromoCta}>Browse player cards →</Link>
        </div>
        {examples.length > 0 ? (
          <ol className={styles.promoCards} aria-label="Featured player cards">
            {examples.map((card) => (
              <li key={card.slug} className={styles.promoCard}>
                <Link href={`/card/${card.slug}`} className={styles.promoCardLink} aria-label={`View ${card.name}'s player card`}>
                  <PlayerCard3D card={card} interactive={false} />
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.promoEmpty}>Player cards will appear here after the first match of the season.</p>
        )}
      </div>
    </section>
  );
}

import Link from "next/link";
import styles from "./HomeWorkspace.module.css";

export default function HomeFooter() {
  return <footer className={styles.homeFooter}>
    <div className={styles.bandInner}><strong>FPL</strong><span>Franchise Premier League</span>
      <nav aria-label="Homepage information"><Link href="/info">About</Link><Link href="/rulebook">Rules</Link><Link href="/league-links">League resources</Link><Link href="/membership">Membership &amp; support</Link></nav>
    </div>
  </footer>;
}

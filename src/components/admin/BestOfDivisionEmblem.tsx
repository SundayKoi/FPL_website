import type { CSSProperties } from "react";
import type { Division } from "@/lib/schedule/types";
import styles from "./BestOfDivisionEmblem.module.css";

const RAY_ANGLES = [0, 30, 60, 90, 120, 150];

function SolariSeal() {
  return (
    <div className={styles.seal}>
      {RAY_ANGLES.map((angle) => (
        <i key={angle} className={styles.ray} style={{ "--angle": `${angle}deg` } as CSSProperties} />
      ))}
      <span className={styles.sun} />
      <span className={styles.jewel} />
      <span className={`${styles.jewel} ${styles.bottomJewel}`} />
    </div>
  );
}

function LunariSeal() {
  return (
    <div className={styles.seal}>
      <span className={styles.moon} />
      <span className={`${styles.star} ${styles.starOne}`} />
      <span className={`${styles.star} ${styles.starTwo}`} />
      <span className={`${styles.star} ${styles.starThree}`} />
      <span className={styles.jewel} />
      <span className={`${styles.jewel} ${styles.bottomJewel}`} />
    </div>
  );
}

export default function BestOfDivisionEmblem({ division }: { division: Division }) {
  const isSolari = division === "Solari";
  return (
    <div className={`${styles.emblem} ${isSolari ? styles.solari : styles.lunari}`} aria-label={`${division} division`} title={`${division} division`}>
      <div className={styles.decorativeSeal} aria-hidden="true">
        {isSolari ? <SolariSeal /> : <LunariSeal />}
      </div>
      <span className={styles.label}>{division.toUpperCase()}</span>
    </div>
  );
}

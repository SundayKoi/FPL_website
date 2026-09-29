import type { ReactNode } from "react";
import styles from "./AboutPage.module.css";

export default function AboutPageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h1>{title}</h1>
      <div className={styles.lede}>{description}</div>
      {children ? <div className={styles.headerActions}>{children}</div> : null}
    </header>
  );
}

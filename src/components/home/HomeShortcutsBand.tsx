import Link from "next/link";
import type { HomeShortcut } from "@/lib/home/shortcuts";
import styles from "./HomeWorkspace.module.css";

/**
 * The signed-in member's four shortcuts, as a band under the match hero on
 * the workspace home. Nothing renders for a visitor with no shortcuts.
 */
export default function HomeShortcutsBand({ shortcuts }: { shortcuts: HomeShortcut[] }) {
  if (shortcuts.length === 0) return null;
  return (
    <div className={styles.shortcutsBand}>
      <nav aria-label="Your shortcuts" data-testid="home-shortcuts" className={`${styles.bandInner} ${styles.shortcutsGrid}`}>
        {shortcuts.map((shortcut) => (
          <Link
            key={shortcut.label}
            href={shortcut.href}
            className={`${styles.softPanel} ${styles.shortcutTile} ${shortcut.accent ? styles.shortcutAccent : ""}`}
          >
            <span className={styles.shortcutLabel}>{shortcut.label}</span>
            <span className={styles.shortcutHint}>{shortcut.hint}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

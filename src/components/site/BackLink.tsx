import Link from "next/link";

/** "← Parent": the one way up every deep page wears, top-left, like the
 *  team page always has. */
export default function BackLink({ href, label, className = "" }: { href: string; label: string; className?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1 rounded-full border border-border-strong px-3 py-1 text-xs font-semibold text-muted transition hover:border-action-text hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${className}`}
    >
      <span aria-hidden="true">←</span> {label}
    </Link>
  );
}

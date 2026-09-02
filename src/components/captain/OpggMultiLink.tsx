/** The shared primary OP.GG multi-search pill used by NextMatchCard and MyRoster. */
export default function OpggMultiLink({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex w-fit rounded-full border border-primary/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary transition hover:bg-primary hover:text-white${className ? ` ${className}` : ""}`}
    >
      {label}
    </a>
  );
}

/** The coral OP.GG multi-search pill shared by NextMatchCard and MyRoster. */
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
      className={`inline-flex w-fit rounded-full border border-coral/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-coral transition hover:bg-coral hover:text-navy${className ? ` ${className}` : ""}`}
    >
      {label}
    </a>
  );
}

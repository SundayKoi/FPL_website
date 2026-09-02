type Props = {
  label: string;
  description: string;
  href: string;
};

export default function InfoResourceCard({ label, description, href }: Props) {
  return (
    <article
      aria-label={`${label} resource`}
      className="card-brand flex h-full flex-col p-6"
    >
      <h2 className="font-display text-3xl font-semibold text-white">{label}</h2>
      <p className="mt-3 flex-1 text-sm leading-6 text-muted">{description}</p>
      <a
        className="mt-6 inline-flex w-fit items-center rounded-full border border-action-text/50 bg-action-fill/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-action-text transition hover:bg-action-fill/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
        href={href}
        rel="noopener noreferrer"
        target="_blank"
      >
        Open resource ↗
      </a>
    </article>
  );
}

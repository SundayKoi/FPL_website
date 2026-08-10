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
      <p className="mt-3 flex-1 text-sm leading-6 text-steel">{description}</p>
      <a
        className="mt-6 inline-flex w-fit items-center rounded-full border border-gold/50 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-gold transition hover:bg-gold/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
        href={href}
        rel="noopener noreferrer"
        target="_blank"
      >
        Open resource ↗
      </a>
    </article>
  );
}

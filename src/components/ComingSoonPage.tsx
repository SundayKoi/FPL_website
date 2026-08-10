type Props = {
  eyebrow: string;
  title: string;
  description: string;
};

export default function ComingSoonPage({ eyebrow, title, description }: Props) {
  return (
    <main className="bg-hash flex-1">
      <section className="mx-auto flex min-h-[calc(100vh-57px)] w-full max-w-5xl items-center px-6 py-16">
        <div className="card-brand w-full p-8 sm:p-12">
          <span className="label-dash">{eyebrow}</span>
          <h1 className="type-display mt-3 text-5xl sm:text-6xl">{title}</h1>
          <p className="mt-4 max-w-xl text-steel">{description}</p>
          <span className="mt-8 inline-flex rounded-full border border-gold/50 bg-gold/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-gold">
            Coming soon
          </span>
        </div>
      </section>
    </main>
  );
}

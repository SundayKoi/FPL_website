import StatsTabs from "@/components/stats/StatsTabs";

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const playerRaw = (await searchParams).player;
  const player = Array.isArray(playerRaw) ? playerRaw[0] : playerRaw;
  return (
    <main className="grid-neon flex-1">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
        <header className="relative pb-8">
          <span className="mono-label">
            <span className="text-cyan">&gt;</span> League Data
          </span>
          <h1 className="type-display text-neon mt-3 text-5xl sm:text-6xl">Stats</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-steel">
            League records, player form, and standings.
          </p>
          <hr className="neon-rule absolute inset-x-0 bottom-0" />
        </header>

        <div className="mt-10">
          <StatsTabs initialPlayer={player} />
        </div>
      </div>
    </main>
  );
}

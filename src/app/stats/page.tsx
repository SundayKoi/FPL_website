import StatsTabs from "@/components/stats/StatsTabs";

export default function StatsPage() {
  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
        <header className="border-b border-line pb-8">
          <span className="label-dash">LEAGUE DATA</span>
          <h1 className="type-display mt-3 text-5xl sm:text-6xl">Stats</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-steel">
            League records, player form, and standings.
          </p>
        </header>

        <div className="mt-10">
          <StatsTabs />
        </div>
      </div>
    </main>
  );
}

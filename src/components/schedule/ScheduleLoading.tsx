import LeaguePageShell from "@/components/league/LeaguePageShell";

export default function ScheduleLoading({ league }: { league: "Premier" | "Academy" }) {
  const leagueView = league === "Academy" ? "academy" : "premier";

  return (
    <LeaguePageShell
      league={leagueView}
      title="Schedule"
      activeSection="schedule"
      headerActions={<div aria-hidden="true" className="h-10 w-36 animate-pulse bg-raised motion-reduce:animate-none" />}
    >
      <section className="flex min-w-0 flex-col gap-6" aria-busy="true" aria-label={"Loading " + league + " schedule"}>
        <div className="flex min-w-0 flex-col gap-2" aria-hidden="true">
          <div className="flex min-w-0 gap-6 overflow-hidden border-b border-border-subtle">
            {[1, 2, 3].map((item) => (
              <div key={item} className="flex h-11 w-32 shrink-0 items-center border-b-2 border-transparent px-1">
                <span className="h-3 w-24 animate-pulse bg-raised motion-reduce:animate-none" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-5 border-b border-border-subtle">
            {[1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="flex h-11 flex-col items-center justify-center gap-1 border-b-2 border-transparent">
                <span className="h-3 w-12 animate-pulse bg-raised motion-reduce:animate-none" />
                <span className="h-2 w-14 animate-pulse bg-raised motion-reduce:animate-none" />
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-h-12 items-center gap-4 border-y border-l-2 border-border-subtle pl-3" aria-hidden="true">
          <span className="h-3 w-14 animate-pulse bg-raised motion-reduce:animate-none" />
          <span className="h-5 w-28 animate-pulse bg-raised motion-reduce:animate-none" />
          <span className="h-3 w-52 animate-pulse bg-raised motion-reduce:animate-none" />
        </div>

        <div className="grid min-w-0 gap-6 min-[1200px]:grid-cols-[minmax(0,1fr)_20rem] min-[1200px]:gap-8" aria-hidden="true">
          <section className="min-w-0">
            <div className="flex h-12 items-center justify-between border-b border-border-subtle">
              <span className="h-6 w-32 animate-pulse bg-raised motion-reduce:animate-none" />
              <span className="h-3 w-20 animate-pulse bg-raised motion-reduce:animate-none" />
            </div>
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="flex h-14 items-center justify-between border-b border-border-subtle/60 px-1">
                <span className="h-4 w-2/5 animate-pulse bg-raised motion-reduce:animate-none" />
                <span className="h-3 w-28 animate-pulse bg-raised motion-reduce:animate-none" />
              </div>
            ))}
          </section>
          <aside className="border-t border-border-subtle pt-4 min-[1200px]:border-l min-[1200px]:border-t-0 min-[1200px]:pl-5 min-[1200px]:pt-0">
            <div className="h-12 border-b border-border-subtle" />
            <div className="grid grid-cols-3 gap-2 pt-4">
              {[1, 2, 3].map((item) => (
                <div key={item} className="flex h-28 flex-col gap-2 border-t border-border-subtle pt-2">
                  <span className="h-2 w-16 animate-pulse bg-raised motion-reduce:animate-none" />
                  <span className="h-10 animate-pulse bg-raised motion-reduce:animate-none" />
                </div>
              ))}
            </div>
          </aside>
        </div>
        <p className="sr-only" role="status">Loading schedule data.</p>
      </section>
    </LeaguePageShell>
  );
}

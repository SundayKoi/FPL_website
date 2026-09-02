import InfoResourceCard from "@/components/info/InfoResourceCard";
import AdminInfoResources from "@/components/info/AdminInfoResources";
import { getInfoPageData } from "@/lib/info/resources";

export default async function LeagueLinksPage() {
  const { resources, isAdmin } = await getInfoPageData();
  const leagueResources = resources.filter((resource) => resource.slug !== "rulebook");

  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="max-w-3xl">
          <span className="label-dash">THE LEAGUE</span>
          <h1 className="type-display mt-3 text-5xl sm:text-6xl">League Links</h1>
          <p className="mt-4 text-lg leading-8 text-muted">
            The shared league resources for payments, reference docs, and season operations.
          </p>
        </header>

        <section
          id="league-resources"
          aria-label="League resources"
          className="mt-10 grid gap-5 md:grid-cols-2"
        >
          {leagueResources.map((resource) => (
            <InfoResourceCard key={resource.label} {...resource} />
          ))}
        </section>

        {isAdmin && <AdminInfoResources resources={resources} />}
      </div>
    </main>
  );
}

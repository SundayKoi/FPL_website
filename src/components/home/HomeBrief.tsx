import type { HomepageBrief } from "@/lib/home/brief";

function Block({ label, title, body }: { label: string; title: string; body: string | null }) {
  if (!body) return null;
  return (
    <article className="rounded-lg border border-line bg-navy/60 p-4">
      <span className="label-dash">{label}</span>
      <h3 className="mt-2 text-xl font-semibold uppercase tracking-tight text-white">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-steel">{body}</p>
    </article>
  );
}

/** The week's written desk copy. Rendered only when a brief is published;
 *  otherwise the homepage keeps its computed award lists. */
export default function HomeBrief({ brief }: { brief: HomepageBrief }) {
  const anything =
    brief.recap || brief.preview || brief.players_note || brief.teams_note || brief.league_notes;
  if (!anything) return null;

  return (
    <section aria-label="This week in the league" className="card-brand p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="label-dash">THE DESK</span>
        {brief.week != null && (
          <span className="text-xs text-steel">After week {brief.week}</span>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Block label="WEEK IN REVIEW" title="How it went" body={brief.recap} />
        <Block label="COMING UP" title="Next week" body={brief.preview} />
        <Block label="INDIVIDUAL HONORS" title="Players setting the pace" body={brief.players_note} />
        <Block label="TEAM HONORS" title="Franchises on the move" body={brief.teams_note} />
      </div>

      {brief.league_notes && (
        <div className="mt-4 rounded-lg border border-line bg-panel p-4">
          <span className="label-dash">AROUND THE LEAGUE</span>
          <p className="mt-2 text-sm leading-relaxed text-steel">{brief.league_notes}</p>
        </div>
      )}
    </section>
  );
}

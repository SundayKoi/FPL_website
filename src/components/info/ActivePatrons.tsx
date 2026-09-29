import PatronFlame from "@/components/patron/PatronFlame";
import { createServerSupabase } from "@/lib/supabase/server";

interface PatronRow {
  username: string;
  avatar_url: string | null;
  patron_until: string;
  patron_flame: string | null;
}

function throughLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

export default async function ActivePatrons() {
  let patrons: PatronRow[] = [];
  let unavailable = false;

  try {
    const supabase = await createServerSupabase();
    const result = await supabase
      .from("patrons_public")
      .select("username, avatar_url, patron_until, patron_flame")
      .order("patron_until", { ascending: false });
    if (result.error) {
      console.error("membership: public patron list unavailable", result.error);
      unavailable = true;
    } else {
      patrons = (result.data as PatronRow[] | null) ?? [];
    }
  } catch (error) {
    console.error("membership: public patron list unavailable", error);
    unavailable = true;
  }

  return (
    <section id="patrons" aria-labelledby="patrons-title" className="scroll-mt-24 border-t border-border-subtle pt-8">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">The Flame Holders</p>
      <h2 id="patrons-title" className="mt-2 font-display text-2xl font-semibold text-white">Current patrons</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
        These supporters have an active public patron listing. Their names and flame appearance come from the public patron view.
      </p>

      {unavailable ? (
        <p role="status" className="mt-5 text-sm text-muted">The patron list is temporarily unavailable.</p>
      ) : patrons.length === 0 ? (
        <p className="mt-5 text-sm text-muted">No active patrons are listed right now.</p>
      ) : (
        <ul aria-label="Active patrons" className="mt-5 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {patrons.map((patron) => (
            <li key={patron.username} className="relative flex min-w-0 items-center gap-3 rounded-lg border border-border-subtle bg-surface p-4">
              <PatronFlame flame={patron.patron_flame} radius="0.75rem" />
              {patron.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={patron.avatar_url}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full border border-gold/50 object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-content-center rounded-full border border-gold/50 text-lg">
                  🔥
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{patron.username}</p>
                <p className="text-[11px] uppercase tracking-wide text-gold">Patron through {throughLabel(patron.patron_until)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

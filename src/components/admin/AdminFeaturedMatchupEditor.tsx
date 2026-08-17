"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { HomepageFeaturedSettings } from "@/lib/home/homepageSettings";

type Homepage = "premier" | "academy";

export type FeaturedFixtureChoice = {
  id: string;
  label: string;
};

type Props = {
  homepage: Homepage;
  fixtures: FeaturedFixtureChoice[];
  settings: HomepageFeaturedSettings;
};

const labels: Record<Homepage, string> = {
  premier: "Premier",
  academy: "Academy",
};

function nullableTrimmed(value: string): string | null {
  return value.trim() || null;
}

export default function AdminFeaturedMatchupEditor({ homepage, fixtures, settings }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const label = labels[homepage];
  const [fixtureId, setFixtureId] = useState(settings.fixtureId ?? "");
  const [title, setTitle] = useState(settings.title ?? "");
  const [description, setDescription] = useState(settings.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    if (busy) return;

    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const { error: saveError } = await supabase.from("homepage_featured_settings").upsert(
        {
          homepage,
          fixture_id: nullableTrimmed(fixtureId),
          title: nullableTrimmed(title),
          description: nullableTrimmed(description),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "homepage" },
      );

      if (saveError) {
        setError(saveError.message);
        return;
      }

      setSaved(true);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save featured matchup. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby={`${homepage}-featured-matchup-title`} className="card-brand flex flex-col gap-3 p-5">
      <div>
        <span className="label-dash">Homepage display</span>
        <h3 id={`${homepage}-featured-matchup-title`} className="type-display mt-2 text-2xl">
          {label} featured matchup
        </h3>
        <p className="mt-1 text-sm text-steel">Choose the current fixture and the copy shown above it on the {label} homepage.</p>
      </div>

      <label className="flex flex-col gap-1 text-xs text-steel">
        {label} fixture
        <select
          aria-label={`${label} fixture`}
          value={fixtureId}
          onChange={(event) => setFixtureId(event.target.value)}
          disabled={busy}
          className="rounded border border-line bg-navy px-2 py-2 text-sm text-white focus:border-coral focus:outline-none disabled:opacity-50"
        >
          <option value="">Automatic schedule selection</option>
          {fixtures.map((fixture) => (
            <option key={fixture.id} value={fixture.id}>{fixture.label}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-steel">
        {label} title
        <input
          aria-label={`${label} title`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={busy}
          className="rounded border border-line bg-navy px-2 py-2 text-sm text-white focus:border-coral focus:outline-none disabled:opacity-50"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-steel">
        {label} description
        <textarea
          aria-label={`${label} description`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={busy}
          rows={3}
          className="rounded border border-line bg-navy px-2 py-2 text-sm text-white focus:border-coral focus:outline-none disabled:opacity-50"
        />
      </label>

      {error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}
      {saved ? <p className="text-sm text-mint">Saved.</p> : null}

      <div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded bg-coral px-3 py-1.5 text-xs font-display font-bold not-italic text-navy hover:brightness-110 disabled:opacity-40"
        >
          {busy ? "Saving…" : `Save ${label} featured matchup`}
        </button>
      </div>
    </section>
  );
}

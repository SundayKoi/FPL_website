"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { HomepageFeaturedSettings } from "@/lib/home/homepageSettings";
import { KNOWN_TWITCH_CHANNELS } from "@/lib/home/twitchChannels";

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
  const [twitchUrl, setTwitchUrl] = useState(settings.twitchUrl ?? "");
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
          twitch_url: nullableTrimmed(twitchUrl),
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
    <details className="card-brand flex flex-col gap-3 p-5">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="label-dash">Homepage display</span>
        <h3 id={`${homepage}-featured-matchup-title`} className="type-display mt-2 text-2xl">
          {label} featured matchup
        </h3>
        <p className="mt-1 text-sm text-muted">Choose the current fixture and the copy shown above it on the {label} homepage.</p>
      </summary>

      <label className="flex flex-col gap-1 text-xs text-muted">
        {label} fixture
        <select
          aria-label={`${label} fixture`}
          value={fixtureId}
          onChange={(event) => setFixtureId(event.target.value)}
          disabled={busy}
          className="input-brand px-2 py-2 text-sm disabled:opacity-50"
        >
          <option value="">Automatic schedule selection</option>
          {fixtures.map((fixture) => (
            <option key={fixture.id} value={fixture.id}>{fixture.label}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted">
        {label} known Twitch channel
        <select
          aria-label={`${label} known Twitch channel`}
          value={KNOWN_TWITCH_CHANNELS.some((channel) => channel.url === twitchUrl) ? twitchUrl : ""}
          onChange={(event) => setTwitchUrl(event.target.value)}
          disabled={busy}
          className="input-brand px-2 py-2 text-sm disabled:opacity-50"
        >
          <option value="">Custom Twitch URL</option>
          {KNOWN_TWITCH_CHANNELS.map((channel) => (
            <option key={channel.url} value={channel.url}>{channel.label}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted">
        {label} Twitch URL
        <input
          type="url"
          aria-label={`${label} Twitch URL`}
          value={twitchUrl}
          onChange={(event) => setTwitchUrl(event.target.value)}
          disabled={busy}
          placeholder="https://www.twitch.tv/channel"
          className="input-brand px-2 py-2 text-sm disabled:opacity-50"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted">
        {label} title
        <input
          aria-label={`${label} title`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={busy}
          className="input-brand px-2 py-2 text-sm disabled:opacity-50"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted">
        {label} description
        <textarea
          aria-label={`${label} description`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={busy}
          rows={3}
          className="input-brand px-2 py-2 text-sm disabled:opacity-50"
        />
      </label>

      {error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}
      {saved ? <p className="text-sm text-mint">Saved.</p> : null}

      <div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="btn-primary px-3 py-1.5 text-xs"
        >
          {busy ? "Saving…" : `Save ${label} featured matchup`}
        </button>
      </div>
    </details>
  );
}

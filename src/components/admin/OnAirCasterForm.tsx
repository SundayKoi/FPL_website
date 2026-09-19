"use client";

// One caster's On Air card settings, as a form. Saves straight to
// `on_air_casters` with the browser client: RLS is the gate (staff, or the
// caster themself — migration 20261020000001), exactly as
// AdminSeasonSettings writes league_settings, so there is no action to keep
// in step with the policy.
//
// Nothing here mints anything. The champion decides what art the card
// wears, and LEAVING IT BLANK is a real setting: that caster prints the
// colour-bar test pattern instead of a photograph.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminInputClass } from "@/components/matches/CollapsibleAdminSection";
import { createClient } from "@/lib/supabase/client";
import { CHAMPIONS } from "@/lib/match-draft/champions";
import { ON_AIR_COPIES } from "@/lib/packs/config";

export interface OnAirCasterFormProps {
  profileId: string;
  name: string;
  champion: string | null;
  skin: number;
  roleLabel: string;
  tagline: string | null;
  active: boolean;
}

export default function OnAirCasterForm({
  profileId,
  name,
  champion: initialChampion,
  skin: initialSkin,
  roleLabel: initialRoleLabel,
  tagline: initialTagline,
  active: initialActive,
}: OnAirCasterFormProps) {
  const supabase = createClient();
  const router = useRouter();
  const [champion, setChampion] = useState(initialChampion ?? "");
  const [skin, setSkin] = useState(String(initialSkin));
  const [roleLabel, setRoleLabel] = useState(initialRoleLabel);
  const [tagline, setTagline] = useState(initialTagline ?? "");
  const [active, setActive] = useState(initialActive);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    const skinNum = Number.parseInt(skin, 10);
    const { error: saveError } = await supabase.from("on_air_casters").upsert({
      profile_id: profileId,
      // Blank is a setting, not an omission: no champion is the no-signal
      // print, so it saves as null rather than as an empty string.
      champion: champion.trim() || null,
      skin: Number.isFinite(skinNum) ? Math.min(Math.max(skinNum, 0), 99) : 0,
      role_label: roleLabel.trim() || "Caster",
      tagline: tagline.trim() || null,
      active,
      updated_at: new Date().toISOString(),
    });
    setBusy(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setSaved(true);
    router.refresh();
  };

  const field = `on-air-${profileId}`;
  const touched = () => setSaved(false);

  return (
    <div className="card-brand flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${field}-champion`} className="label-dash">
            Champion
          </label>
          <input
            id={`${field}-champion`}
            type="text"
            list={`${field}-champions`}
            value={champion}
            onChange={(event) => {
              setChampion(event.target.value);
              touched();
            }}
            placeholder="Blank = no signal"
            className={`w-44 ${adminInputClass}`}
          />
          <datalist id={`${field}-champions`}>
            {CHAMPIONS.map((entry) => (
              <option key={entry.name} value={entry.name} />
            ))}
          </datalist>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${field}-skin`} className="label-dash">
            Skin
          </label>
          <input
            id={`${field}-skin`}
            type="number"
            min={0}
            max={99}
            value={skin}
            onChange={(event) => {
              setSkin(event.target.value);
              touched();
            }}
            className={`w-20 ${adminInputClass}`}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${field}-role`} className="label-dash">
            Role word
          </label>
          <input
            id={`${field}-role`}
            type="text"
            maxLength={24}
            value={roleLabel}
            onChange={(event) => {
              setRoleLabel(event.target.value);
              touched();
            }}
            placeholder="Play-by-play · Colour"
            className={`w-40 ${adminInputClass}`}
          />
        </div>

        <div className="flex min-w-[16rem] flex-1 flex-col gap-1">
          <label htmlFor={`${field}-tagline`} className="label-dash">
            Tagline
          </label>
          <input
            id={`${field}-tagline`}
            type="text"
            maxLength={80}
            value={tagline}
            onChange={(event) => {
              setTagline(event.target.value);
              touched();
            }}
            placeholder="The card's motto, 80 characters"
            className={`w-full ${adminInputClass}`}
          />
        </div>

        <label htmlFor={`${field}-active`} className="flex items-center gap-2 pb-1.5 text-sm text-white">
          <input
            id={`${field}-active`}
            type="checkbox"
            checked={active}
            onChange={(event) => {
              setActive(event.target.checked);
              touched();
            }}
          />
          In the pool
        </label>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={busy}
          className="rounded-full bg-action-fill px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>

        {saved && <span className="text-xs font-semibold text-success">Saved</span>}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <p className="text-xs text-muted">
        {name}&apos;s card wears this champion&apos;s splash at this skin number. Leave the champion blank and the card
        prints the test pattern instead — no signal. Out of the pool, they stop printing entirely; the copies already
        minted keep their numbers, and the season&apos;s {ON_AIR_COPIES} are counted per caster.
      </p>
    </div>
  );
}

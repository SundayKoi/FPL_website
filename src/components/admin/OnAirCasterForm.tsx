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
//
// The skin is a PICKER, not a number. Riot's skin nums are sparse (Ahri:
// 0–8, 14, 17, 27, …), and a num the champion has no skin at saves fine and
// then silently prints the base art — which reads as a broken skin field.
// So the champion's catalog is read by name through a staff-gated action
// (fetchOnAirSkinCatalogAction), the desk chooses a skin BY NAME, the art of
// the one chosen is shown beside it, and a num outside the list is refused
// before the upsert. The bare number input survives only as the fallback for
// when the catalog cannot be read at all.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adminInputClass } from "@/components/matches/CollapsibleAdminSection";
import { createClient } from "@/lib/supabase/client";
import { fetchOnAirSkinCatalogAction } from "@/lib/cards/onAir-actions";
import { CHAMPIONS, championByName, championCenteredUrl, championSplashUrl } from "@/lib/match-draft/champions";
import type { ChampionSkin } from "@/lib/packs/skins";
import { ON_AIR_COPIES } from "@/lib/packs/config";

/** The same ceiling `save_card_art_preference` (20261018) uses, and what
 *  migration 20261021000001 lifted the column's own check to. */
const SKIN_MAX = 200;

interface CatalogState {
  available: boolean;
  skins: ChampionSkin[];
}

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
  // Keyed by Riot's canonical champion name, so "ahri", "Ahri" and " Ahri "
  // share one entry and the map doubles as the cache: a champion typed twice
  // is read from Riot once.
  const [catalogs, setCatalogs] = useState<Record<string, CatalogState>>({});
  const [catalogError, setCatalogError] = useState<string | null>(null);
  // SkinPicker's pattern: only the newest request may answer, so a slow
  // reply for a champion typed earlier never overwrites a later one.
  const catalogRequestRef = useRef(0);
  // The champion a read is out for, so the effect below cannot fire a second
  // read for one already in flight. A ref, not state: nothing renders off it.
  const inFlightRef = useRef<string | null>(null);

  const resolved = championByName(champion);
  const resolvedName = resolved?.name ?? null;
  const catalog = resolvedName ? catalogs[resolvedName] : undefined;

  const loadCatalog = useCallback((canonicalName: string) => {
    const requestId = ++catalogRequestRef.current;
    inFlightRef.current = canonicalName;
    // A failure is recorded in the map as "unreadable" rather than left
    // blank: it is an answer, so the field settles on the number-input
    // fallback instead of retrying Riot on every render.
    const settle = (state: CatalogState) => {
      if (inFlightRef.current === canonicalName) inFlightRef.current = null;
      setCatalogs((current) => ({ ...current, [canonicalName]: state }));
    };
    void fetchOnAirSkinCatalogAction(canonicalName)
      .then((result) => {
        if (requestId !== catalogRequestRef.current) return;
        if (!result.ok) {
          setCatalogError(result.error);
          settle({ available: false, skins: [] });
          return;
        }
        setCatalogError(null);
        settle({ available: result.available, skins: result.skins });
      })
      .catch(() => {
        if (requestId !== catalogRequestRef.current) return;
        setCatalogError("The skin list could not be loaded.");
        settle({ available: false, skins: [] });
      });
  }, []);

  // Mount and every champion change in one place: read Riot when the name
  // resolves to a champion the map has no answer for yet, and ask for nothing
  // at all when it is blank or not a champion.
  useEffect(() => {
    if (!resolvedName || catalogs[resolvedName] || inFlightRef.current === resolvedName) return;
    loadCatalog(resolvedName);
  }, [resolvedName, catalogs, loadCatalog]);

  const parsedSkin = Number.parseInt(skin, 10);
  const skinNum = Number.isFinite(parsedSkin) ? Math.min(Math.max(parsedSkin, 0), SKIN_MAX) : 0;

  // No answer yet IS the loading state — there is nothing else a resolved
  // champion with no map entry can be waiting for.
  const loadingCatalog = Boolean(resolvedName) && catalog === undefined;
  // The picker is what the field IS whenever the catalog can speak for this
  // champion — including while it is still being read, so the field does not
  // flip from number to select under the cursor.
  const usePicker = loadingCatalog || (Boolean(resolvedName) && catalog?.available === true);
  const listed = catalog?.available ? catalog.skins : [];
  // A stale num from before the picker existed stays on the list, named for
  // what it is, so opening the form changes nobody's saved setting.
  const options = listed.some((entry) => entry.num === skinNum)
    ? listed
    : [...listed, { num: skinNum, name: `Skin ${skinNum} (not in Riot's list)` }].sort((a, b) => a.num - b.num);

  const handleSave = async () => {
    setError(null);
    setSaved(false);
    // The refusal the number input could never make: Riot publishes no skin
    // at this num for this champion, so saving it would print base art and
    // look like the picker had ignored the choice.
    if (catalog?.available && !catalog.skins.some((entry) => entry.num === skinNum)) {
      setError(`That skin is not one of ${resolvedName ?? champion.trim()}'s.`);
      return;
    }
    setBusy(true);
    const { error: saveError } = await supabase.from("on_air_casters").upsert({
      profile_id: profileId,
      // Blank is a setting, not an omission: no champion is the no-signal
      // print, so it saves as null rather than as an empty string.
      champion: champion.trim() || null,
      skin: skinNum,
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

  const handleChampionChange = (value: string) => {
    const next = championByName(value);
    // Same champion spelled differently keeps the skin; a different one (or
    // none) starts from base art, because the old num means nothing here.
    if ((next?.name ?? "") !== (resolvedName ?? "")) {
      setSkin("0");
      setCatalogError(null);
      setError(null);
    }
    setChampion(value);
    touched();
  };

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
            onChange={(event) => handleChampionChange(event.target.value)}
            // A name typed out in full without picking from the datalist
            // still has to reach the catalog — and a read that failed gets
            // one more chance here rather than needing the name retyped.
            // Dropping the recorded answer is what asks: the effect above
            // reads Riot again for a champion the map no longer answers for.
            onBlur={() => {
              if (!resolvedName || catalogs[resolvedName]?.available) return;
              setCatalogs((current) => {
                const next = { ...current };
                delete next[resolvedName];
                return next;
              });
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
          {usePicker ? (
            <select
              id={`${field}-skin`}
              // The clamped num, not the raw string, so what the field shows
              // is always what a save would write.
              value={String(skinNum)}
              disabled={loadingCatalog}
              onChange={(event) => {
                setSkin(event.target.value);
                touched();
              }}
              className={`w-52 ${adminInputClass}`}
            >
              {loadingCatalog ? (
                <option value={String(skinNum)}>Loading skins…</option>
              ) : (
                options.map((entry) => (
                  <option key={entry.num} value={entry.num}>
                    {entry.num === 0 ? "Original" : entry.name}
                  </option>
                ))
              )}
            </select>
          ) : (
            <input
              id={`${field}-skin`}
              type="number"
              min={0}
              max={SKIN_MAX}
              value={skin}
              onChange={(event) => {
                setSkin(event.target.value);
                touched();
              }}
              className={`w-20 ${adminInputClass}`}
            />
          )}
          {usePicker ? null : (
            <span className="text-[11px] text-muted">
              {champion.trim() ? "Riot's skin number; the list could not be loaded" : "Set a champion to pick a skin by name"}
            </span>
          )}
        </div>

        {resolvedName ? (
          <div className="flex flex-col gap-1">
            <span className="label-dash">Art</span>
            {/* Keyed on the choice so a change remounts the image: the error
                handler below swaps in the wider `splash` directory, and that
                swap must be retried from scratch for the next skin. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={`${resolvedName}:${skinNum}`}
              data-testid={`${field}-skin-art`}
              src={championCenteredUrl(resolvedName, skinNum) ?? championSplashUrl(resolvedName, skinNum) ?? ""}
              alt=""
              loading="lazy"
              className="aspect-[4/3] w-24 rounded border border-border-subtle object-cover object-[center_20%]"
              onError={(event) => {
                const image = event.currentTarget;
                // Riot's `centered` crop is missing for a great many valid
                // skins; `splash` covers nearly all of them. Same two-stage
                // fallback SkinPicker uses.
                const fallback = championSplashUrl(resolvedName, skinNum);
                if (fallback && image.dataset.artStage !== "1" && image.src !== fallback) {
                  image.dataset.artStage = "1";
                  image.src = fallback;
                }
              }}
            />
          </div>
        ) : null}

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

      {(error ?? catalogError) && (
        <p role="alert" className="text-sm text-red-400">
          {error ?? catalogError}
        </p>
      )}

      <p className="text-xs text-muted">
        {name}&apos;s card wears this champion&apos;s splash at the skin picked beside it. Leave the champion blank and
        the card prints the test pattern instead — no signal. Out of the pool, they stop printing entirely; the copies
        already minted keep their numbers, and the season&apos;s {ON_AIR_COPIES} are counted per caster.
      </p>
    </div>
  );
}

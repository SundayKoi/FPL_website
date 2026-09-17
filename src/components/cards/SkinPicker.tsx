"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { championCenteredUrl, championSplashUrl } from "@/lib/match-draft/champions";
import { saveCardArtworkAction } from "@/lib/cards/artwork-actions";
import type { ChampionSkin } from "@/lib/packs/skins";
import { createClient } from "@/lib/supabase/client";
import SignaturePad from "./SignaturePad";
import { SIGNED_CHANCE } from "@/lib/packs/config";

const MOTTO_MAX = 60;
const DEFAULT_SKIN_NUMS = [0];

export interface SkinPickerChampion {
  champion: string;
  games: number;
}

interface CatalogState {
  available: boolean;
  skins: ChampionSkin[];
}

function uniqueSkins(skins: ChampionSkin[], currentSkin: number): ChampionSkin[] {
  return [...new Map([
    { num: 0, name: "Original" },
    ...skins,
    { num: currentSkin, name: currentSkin === 0 ? "Original" : `Skin ${currentSkin}` },
  ].map((skin) => [skin.num, skin])).values()].sort((a, b) => a.num - b.num);
}

export default function SkinPicker({
  season,
  summonerName,
  tag,
  champion,
  currentSkin,
  skinNums = DEFAULT_SKIN_NUMS,
  skinCatalog,
  skinCatalogAvailable = true,
  eligibleChampions = [],
  currentArtChampion = null,
  hasArtOverride = false,
  currentMotto = null,
  currentSignature = null,
  initialOpen = false,
  patronInks = false,
}: {
  season: string;
  summonerName: string;
  tag: string;
  /** Legacy/current computed champion. The editable list is authoritative when supplied. */
  champion?: string | null;
  currentSkin: number;
  /** Numeric compatibility input for callers that have not loaded names yet. */
  skinNums?: number[];
  skinCatalog?: ChampionSkin[];
  skinCatalogAvailable?: boolean;
  eligibleChampions?: SkinPickerChampion[];
  currentArtChampion?: string | null;
  hasArtOverride?: boolean;
  currentMotto?: string | null;
  currentSignature?: string | null;
  initialOpen?: boolean;
  patronInks?: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();
  const computedChampion = currentArtChampion ?? champion ?? eligibleChampions[0]?.champion ?? null;
  const mostPlayedChampion = eligibleChampions[0]?.champion ?? champion ?? null;
  const initialCatalog = useMemo<CatalogState>(() => ({
    available: skinCatalogAvailable,
    skins: uniqueSkins(skinCatalog ?? skinNums.map((num) => ({ num, name: num === 0 ? "Original" : `Skin ${num}` })), currentSkin),
  }), [currentSkin, skinCatalog, skinCatalogAvailable, skinNums]);

  const [open, setOpen] = useState(initialOpen);
  const [saving, setSaving] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const [motto, setMotto] = useState(currentMotto ?? "");
  const [draftChampion, setDraftChampion] = useState<string | null>(computedChampion);
  const [draftSkin, setDraftSkin] = useState(currentSkin);
  const [clearOverride, setClearOverride] = useState(!hasArtOverride);
  const [persistedHasOverride, setPersistedHasOverride] = useState(hasArtOverride);
  const [persistedChampion, setPersistedChampion] = useState(currentArtChampion ?? mostPlayedChampion);
  const [persistedSkin, setPersistedSkin] = useState(currentSkin);
  const [catalogs, setCatalogs] = useState<Record<string, CatalogState>>(
    computedChampion ? { [computedChampion]: initialCatalog } : {},
  );
  const catalogRequestRef = useRef(0);

  const catalog = draftChampion ? catalogs[draftChampion] : undefined;
  const skins = uniqueSkins(catalog?.skins ?? [], draftSkin);

  const loadCatalog = (nextChampion: string, fallbackSkin: number) => {
    const requestId = ++catalogRequestRef.current;
    setLoadingCatalog(true);
    setError(null);
    const query = new URLSearchParams({ season, summoner: summonerName, tag, champion: nextChampion });
    fetch(`/api/cards/artwork/catalog?${query.toString()}`)
      .then(async (response) => {
        const body = (await response.json()) as { available?: boolean; skins?: ChampionSkin[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Skin catalog could not be loaded.");
        if (requestId !== catalogRequestRef.current) return;
        setCatalogs((current) => ({
          ...current,
          [nextChampion]: { available: body.available === true, skins: uniqueSkins(body.skins ?? [], fallbackSkin) },
        }));
      })
      .catch((reason: unknown) => {
        if (requestId !== catalogRequestRef.current) return;
        setError(reason instanceof Error ? reason.message : "Skin catalog could not be loaded.");
      })
      .finally(() => {
        if (requestId === catalogRequestRef.current) setLoadingCatalog(false);
      });
  };

  const selectChampion = (next: string) => {
    setDraftChampion(next || null);
    setDraftSkin(0);
    setClearOverride(false);
    setBroken(new Set());
    setError(null);
    if (next) loadCatalog(next, 0);
  };

  const resetToBase = () => {
    if (!mostPlayedChampion) return;
    setDraftChampion(mostPlayedChampion);
    setDraftSkin(0);
    setClearOverride(true);
    setBroken(new Set());
    setError(null);
  };

  const saveArtwork = async () => {
    if (!draftChampion) return;
    if (!clearOverride && (!catalog?.available || !catalog.skins.some((skin) => skin.num === draftSkin))) {
      setError("Load the selected champion's skins before saving. Your saved artwork is unchanged.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await saveCardArtworkAction({
      season,
      summonerName,
      tag,
      artChampion: clearOverride ? null : draftChampion,
      skin: draftSkin,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPersistedChampion(clearOverride ? mostPlayedChampion : draftChampion);
    setPersistedSkin(draftSkin);
    setPersistedHasOverride(!clearOverride);
    router.refresh();
  };

  const saveMotto = async () => {
    const cleaned = [...motto]
      .filter((ch) => ch.charCodeAt(0) >= 0x20 && ch.charCodeAt(0) !== 0x7f)
      .join("")
      .trim()
      .slice(0, MOTTO_MAX);
    setMotto(cleaned);
    setSaving(true);
    setError(null);
    const { error: saveError } = await supabase
      .from("card_art_prefs")
      .upsert({ season, summoner_name: summonerName, tag, motto: cleaned || null }, { onConflict: "season,summoner_name,tag" });
    setSaving(false);
    if (saveError) setError(saveError.message);
    else router.refresh();
  };

  const changed = draftChampion !== persistedChampion || draftSkin !== persistedSkin || !clearOverride !== persistedHasOverride;
  const canChoose = eligibleChampions.length > 0;

  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="rounded-full border border-border-strong bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted transition hover:border-action-text hover:text-action-text"
      >
        {open ? "Close customizer" : "Customize Season Card"}
      </button>
      {open ? (
        <div className="flex w-full flex-col gap-5 rounded-xl border border-border-subtle bg-surface/70 p-4 sm:p-6">
          <div className="flex flex-col gap-2">
            <span className="label-dash">Season Card artwork</span>
            <p className="text-center text-xs text-muted">Choose any champion played in {season}, then choose one of that champion&apos;s skins. Stats and the Signature champion never change.</p>
          </div>

          {canChoose ? (
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <label className="flex flex-col gap-1 text-xs text-muted">
                Champion played this split
                <select
                  aria-label="Champion played this split"
                  value={draftChampion ?? ""}
                  disabled={saving}
                  onChange={(event) => selectChampion(event.target.value)}
                  className="input-brand px-3 py-2 text-sm text-white"
                >
                  {eligibleChampions.map((entry) => <option key={entry.champion} value={entry.champion}>{entry.champion} · {entry.games} {entry.games === 1 ? "game" : "games"}</option>)}
                </select>
              </label>
              <div className="flex items-end gap-2">
                <button type="button" onClick={resetToBase} disabled={saving} className="btn-secondary px-3 py-2 text-xs">Use most-played champion</button>
                <span className="text-[11px] text-muted">resets to base art</span>
              </div>
            </div>
          ) : (
            <p className="rounded border border-border-subtle p-3 text-center text-sm text-muted">No played champions are available for this split yet.</p>
          )}

          {draftChampion ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-white">{draftChampion} · {catalog?.skins.find((skin) => skin.num === draftSkin)?.name ?? (draftSkin === 0 ? "Original" : `Skin ${draftSkin}`)}</p>
                {loadingCatalog ? <span className="text-xs text-muted" role="status">Loading skins…</span> : null}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {skins.filter((skin) => !broken.has(`${draftChampion}:${skin.num}`)).map((skin) => {
                  const key = `${draftChampion}:${skin.num}`;
                  const active = skin.num === draftSkin;
                  return (
                    <button
                      key={skin.num}
                      type="button"
                      disabled={saving}
                      onClick={() => { setDraftSkin(skin.num); setClearOverride(false); }}
                      aria-pressed={active}
                      className={`relative min-w-0 overflow-hidden rounded border text-left transition ${active ? "border-coral ring-2 ring-focus/60" : "border-border-strong hover:border-action-text"}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={championCenteredUrl(draftChampion, skin.num) ?? championSplashUrl(draftChampion, skin.num) ?? ""}
                        alt={`${draftChampion} — ${skin.name}`}
                        className="h-20 w-full object-cover object-[center_20%]"
                        loading="lazy"
                        onError={(event) => {
                          const image = event.currentTarget;
                          const fallback = championSplashUrl(draftChampion, skin.num);
                          if (fallback && image.dataset.artStage !== "1" && image.src !== fallback) {
                            image.dataset.artStage = "1";
                            image.src = fallback;
                            return;
                          }
                          setBroken((current) => new Set(current).add(key));
                        }}
                      />
                      <span className="block truncate px-2 py-1 text-[11px] text-white">{skin.name}</span>
                      {active ? <span className="absolute right-1 top-1 rounded bg-coral/90 px-1.5 py-0.5 text-[9px] font-bold uppercase text-canvas">Draft</span> : null}
                    </button>
                  );
                })}
              </div>
              {!catalog?.available ? <p className="text-xs text-amber-300">Skin catalog unavailable. Base art is shown, but alternate artwork will not be saved until the catalog loads.</p> : null}
            </div>
          ) : null}

          {canChoose ? (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-subtle pt-4">
              <button type="button" onClick={() => { setDraftChampion(persistedChampion); setDraftSkin(persistedSkin); setClearOverride(!persistedHasOverride); setError(null); }} disabled={saving || !changed} className="btn-secondary px-4 py-2 text-xs disabled:opacity-40">Cancel</button>
              <button type="button" onClick={() => void saveArtwork()} disabled={saving || !changed || loadingCatalog} className="btn-primary px-4 py-2 text-xs disabled:opacity-40">{saving ? "Saving…" : "Save artwork"}</button>
            </div>
          ) : null}

          <div className="flex flex-col gap-1 border-t border-border-subtle pt-4">
            <label htmlFor="card-motto" className="text-xs text-muted">Motto — one line on the card back ({MOTTO_MAX} characters max)</label>
            <div className="flex gap-2">
              <input id="card-motto" value={motto} onChange={(event) => setMotto(event.target.value)} maxLength={MOTTO_MAX} placeholder={'"I don\'t ward, I win."'} className="input-brand min-w-0 flex-1 px-3 py-2 text-sm" />
              <button type="button" disabled={saving || (currentMotto ?? "") === motto.trim()} onClick={() => void saveMotto()} className="btn-primary px-4 py-2 text-xs disabled:opacity-40">Save</button>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 border-t border-border-subtle pt-4">
            <span className="label-dash">Signature</span>
            <p className="text-center text-xs text-muted">Sign your card — at least 1 in {Math.round(1 / SIGNED_CHANCE)} of your pulls comes out autographed, more while few have signed.</p>
            <SignaturePad season={season} summonerName={summonerName} tag={tag} currentSignature={currentSignature} patronInks={patronInks} />
          </div>

          {error ? <p role="alert" className="text-xs text-red-400">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

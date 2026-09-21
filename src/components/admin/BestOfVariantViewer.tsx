"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PlayerCardData } from "@/lib/cards/build";
import type { AwardWinner, SeasonAward } from "@/lib/season-end/derive";
import type { Division } from "@/lib/schedule/types";
import type { BestOfVariantResponse, BestOfVariantRequest } from "@/lib/season-end/variantPreview";
import { championCenteredUrl, championSplashUrl } from "@/lib/match-draft/champions";
import BestOfChampionCard from "./BestOfChampionCard";
import styles from "./BestOfVariantViewer.module.css";

export default function BestOfVariantViewer({
  children,
  award,
  winner,
  playerCard,
  season,
  league,
  headingId,
  division,
  showVariantButton = true,
}: {
  children: ReactNode;
  award: SeasonAward;
  winner: AwardWinner;
  playerCard?: PlayerCardData | null;
  season: string;
  league: "premier" | "academy";
  headingId: string;
  division?: Division;
  showVariantButton?: boolean;
}) {
  const request = useMemo<BestOfVariantRequest>(() => ({
    league,
    season,
    summonerName: winner.name.split("#")[0] ?? winner.name,
    tag: winner.name.includes("#") ? winner.name.slice(winner.name.lastIndexOf("#") + 1) : playerCard?.tag ?? "",
    awardedChampion: winner.champion ?? "",
  }), [league, playerCard?.tag, season, winner.champion, winner.name]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [variant, setVariant] = useState<BestOfVariantResponse | null>(null);
  const [skin, setSkin] = useState(0);
  const [signed, setSigned] = useState(false);
  const [brokenSkins, setBrokenSkins] = useState<Set<number>>(new Set());
  const [unavailableSkins, setUnavailableSkins] = useState<Set<number>>(new Set());
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const requestRef = useRef(0);

  const loadVariant = async () => {
    const id = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams({
      league: request.league,
      season: request.season,
      summoner: request.summonerName,
      tag: request.tag,
      champion: request.awardedChampion,
    });
    try {
      const response = await fetch(`/api/admin/seasons-end/variants?${params.toString()}`);
      const body = (await response.json()) as BestOfVariantResponse & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Variant preview could not be loaded.");
      if (id !== requestRef.current) return;
      setVariant(body);
      setSkin(0);
      setSigned(false);
      setBrokenSkins(new Set());
      setUnavailableSkins(new Set());
    } catch (reason: unknown) {
      if (id === requestRef.current) setLoadError(reason instanceof Error ? reason.message : "Variant preview could not be loaded.");
    } finally {
      if (id === requestRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button, [href], select, input, textarea, [tabindex]:not([tabindex='-1'])")]
        .filter((element) => !element.hasAttribute("disabled"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) openerRef.current?.focus();
  }, [open]);

  const openViewer = () => {
    openerRef.current = document.activeElement as HTMLButtonElement | null;
    setOpen(true);
    if (!variant && !loading) void loadVariant();
  };

  const signedAvailable = variant?.autographStatus === "available" && Boolean(variant.autograph);
  const selectedSkin = variant?.skins.find((entry) => entry.num === skin);

  return (
    <div className={styles.wrapper}>
      {children}
      {showVariantButton ? (
        <button ref={openerRef} type="button" onClick={openViewer} className={styles.openButton}>
          View variants
        </button>
      ) : null}
      {open ? (
        <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={`${headingId}-variant-title`}>
            <div className={styles.dialogHeader}>
              <div>
                <p className={styles.eyebrow}>Variant preview</p>
                <h2 id={`${headingId}-variant-title`} className={styles.title}>{winner.title ?? `Best of ${winner.champion}`}</h2>
              </div>
              <button ref={closeRef} type="button" onClick={() => setOpen(false)} className={styles.closeButton} aria-label="Close variant preview">×</button>
            </div>

            {loading ? <p className={styles.message} role="status">Loading skins and season signature…</p> : null}
            {loadError ? <div className={styles.message}><p role="alert">{loadError}</p><button type="button" onClick={() => void loadVariant()} className={styles.retry}>Retry</button></div> : null}
            {variant ? (
              <>
                <div className={styles.controls}>
                  <fieldset className={styles.skinFieldset}>
                    <legend>Skin</legend>
                    <div className={styles.skinGrid}>
                      {variant.skins.filter((entry) => !brokenSkins.has(entry.num)).map((entry) => (
                        <button
                          key={entry.num}
                          type="button"
                          aria-label={`${entry.name} skin`}
                          aria-pressed={skin === entry.num}
                          onClick={() => { setSkin(entry.num); setSigned(false); }}
                          className={`${styles.skinButton} ${skin === entry.num ? styles.selected : ""}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={championCenteredUrl(variant.champion, entry.num) ?? championSplashUrl(variant.champion, entry.num) ?? ""}
                            alt=""
                            onError={(event) => {
                              const image = event.currentTarget;
                              const fallback = championSplashUrl(variant.champion, entry.num);
                              if (fallback && image.dataset.artStage !== "1" && image.src !== fallback) {
                                image.dataset.artStage = "1";
                                image.src = fallback;
                                return;
                              }
                              setBrokenSkins((current) => new Set(current).add(entry.num));
                              setUnavailableSkins((current) => new Set(current).add(entry.num));
                            }}
                          />
                          <span>{entry.name}</span>
                        </button>
                      ))}
                    </div>
                    {!variant.catalogAvailable ? (
                      <p className={styles.warning}>Skin catalog unavailable. Base art is the only available preview until retry succeeds. <button type="button" onClick={() => void loadVariant()} className={styles.retry}>Retry</button></p>
                    ) : null}
                    {skin !== 0 && unavailableSkins.has(skin) ? <p className={styles.warning}>This skin&apos;s artwork is unavailable. The preview is showing base art instead; choose another skin or reset.</p> : null}
                  </fieldset>
                  <div className={styles.signatureControls}>
                    <span className={styles.legend}>Appearance</span>
                    <div className={styles.toggle} role="group" aria-label="Signature appearance">
                      <button type="button" aria-pressed={!signed} onClick={() => setSigned(false)} className={!signed ? styles.activeToggle : ""}>Unsigned</button>
                      <button type="button" aria-pressed={signed} disabled={!signedAvailable} onClick={() => setSigned(true)} className={signed ? styles.activeToggle : ""}>Signed</button>
                    </div>
                    {variant.autographStatus === "missing" ? <p className={styles.note}>No signature on file for this season.</p> : null}
                    {variant.autographStatus === "query-failed" ? <p className={styles.note}>Signature lookup failed. <button type="button" onClick={() => void loadVariant()} className={styles.retry}>Retry</button></p> : null}
                    <button type="button" onClick={() => { setSkin(0); setSigned(false); }} className={styles.reset}>Reset to base</button>
                  </div>
                </div>
                <div className={styles.previewCard}>
                  <BestOfChampionCard
                    award={award}
                    winner={winner}
                    playerCard={playerCard}
                    season={season}
                    league={league}
                    headingId={`${headingId}-variant-face`}
                    division={division}
                    artSkin={skin}
                    autograph={signed && signedAvailable ? variant.autograph : null}
                    showAdminDetails={false}
                  />
                  <p className={styles.previewLabel}>{winner.champion} · {selectedSkin?.name ?? "Original"} · {signed && signedAvailable ? "Signed" : "Unsigned"}</p>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

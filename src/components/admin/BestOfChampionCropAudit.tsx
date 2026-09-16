"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import type { Division } from "@/lib/schedule/types";
import type { ChampionArtCrop } from "@/lib/season-end/championArt";
import { championArtCrop, isChampionArtReviewed } from "@/lib/season-end/championArt";
import type { SeasonAward } from "@/lib/season-end/derive";
import BestOfChampionCard from "./BestOfChampionCard";
import styles from "./BestOfChampionCropAudit.module.css";

export interface BestOfChampionCropAuditEntry {
  name: string;
  id: string;
}

interface Props {
  champions: BestOfChampionCropAuditEntry[];
}

type CropField = "cropPositionX" | "cropPositionY" | "zoom";
type AuditDivision = Division | "none";

const AUDIT_AWARD: SeasonAward = {
  id: "best-of-champion",
  title: "Best of Champion",
  description: "Developer crop audit; local changes are not persisted.",
  group: "Best of Champions",
  scope: "player",
  partition: "league",
  status: "ready",
  winners: [],
};

function auditWinner(champion: BestOfChampionCropAuditEntry) {
  return {
    name: "Crop audit",
    team: "Crop audit",
    value: 0,
    games: 1,
    champion: champion.name,
    championGames: 1,
    title: `Best of ${champion.name}`,
    evidence: { record: "Base skin" },
  };
}

function clampCropValue(field: CropField, value: number): number {
  if (!Number.isFinite(value)) return field === "zoom" ? 1 : 50;
  if (field === "zoom") return Math.max(1, Math.min(2, value));
  return Math.max(0, Math.min(100, value));
}

export default function BestOfChampionCropAudit({ champions }: Props) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(champions[0]?.id ?? "");
  const [width, setWidth] = useState<180 | 280 | 360 | 480>(280);
  const [division, setDivision] = useState<AuditDivision>("Solari");
  const [overrides, setOverrides] = useState<Record<string, ChampionArtCrop>>({});

  const filteredChampions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return normalizedQuery
      ? champions.filter((champion) => champion.name.toLowerCase().includes(normalizedQuery))
      : champions;
  }, [champions, query]);
  const selected = filteredChampions.find((champion) => champion.id === selectedId) ?? filteredChampions[0] ?? null;
  const selectedCrop = selected
    ? overrides[selected.id] ?? championArtCrop(selected.name, 0)
    : null;
  const exportValues = useMemo(
    () => Object.fromEntries(champions.map((champion) => [
      champion.name,
      overrides[champion.id] ?? championArtCrop(champion.name, 0),
    ])),
    [champions, overrides],
  );

  function updateSelectedCrop(field: CropField, rawValue: string) {
    if (!selected) return;
    const value = clampCropValue(field, Number(rawValue));
    setOverrides((current) => ({
      ...current,
      [selected.id]: { ...(selectedCrop ?? championArtCrop(selected.name, 0)), [field]: value },
    }));
  }

  function downloadExport() {
    const blob = new Blob([JSON.stringify(exportValues, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "best-of-champion-art-crops.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section
      className={styles.audit}
      data-testid="best-of-crop-audit"
      style={{ "--audit-card-width": `${width}px` } as CSSProperties}
      aria-label="Best of Champion crop audit"
    >
      <div className={styles.toolbar}>
        <label className={styles.searchLabel}>
          Search champions
          <input
            className={styles.search}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the supported roster"
          />
        </label>
        <div className={styles.toolbarActions}>
          <label className={styles.selectLabel}>
            Preview width
            <select className={styles.select} value={width} onChange={(event) => setWidth(Number(event.target.value) as 180 | 280 | 360 | 480)}>
              <option value={180}>180px · narrow</option>
              <option value={280}>280px · compact</option>
              <option value={360}>360px · desktop</option>
              <option value={480}>480px · wide</option>
            </select>
          </label>
          <label className={styles.selectLabel}>
            Division treatment
            <select className={styles.select} value={division} onChange={(event) => setDivision(event.target.value as AuditDivision)}>
              <option value="none">Unspecified</option>
              <option value="Solari">Solari</option>
              <option value="Lunari">Lunari</option>
            </select>
          </label>
          <button type="button" className={styles.download} onClick={downloadExport}>Download crop JSON</button>
        </div>
      </div>

      <div className={styles.summary}>
        <span>{filteredChampions.length} of {champions.length} supported champions shown</span>
        <span>Local edits only · export and apply to {"src/lib/season-end/championArt.ts"}</span>
      </div>

      {selected && selectedCrop ? (
        <div className={styles.selectedPanel}>
          <div className={styles.selectedHeading}>
            <h2 className={styles.selectedTitle}>Editing {selected.name}</h2>
            <span className={isChampionArtReviewed(selected.name, 0) ? styles.reviewed : styles.unreviewed}>
              {isChampionArtReviewed(selected.name, 0) ? "Reviewed base skin" : "Unreviewed fallback"}
            </span>
          </div>
          <div className={styles.ranges}>
            <label className={styles.rangeLabel}>
              Horizontal crop <output className={styles.rangeOutput}>{selectedCrop.cropPositionX}%</output>
              <input className={styles.range} type="range" min="0" max="100" step="1" value={selectedCrop.cropPositionX} onChange={(event) => updateSelectedCrop("cropPositionX", event.target.value)} />
            </label>
            <label className={styles.rangeLabel}>
              Vertical crop <output className={styles.rangeOutput}>{selectedCrop.cropPositionY}%</output>
              <input className={styles.range} type="range" min="0" max="100" step="1" value={selectedCrop.cropPositionY} onChange={(event) => updateSelectedCrop("cropPositionY", event.target.value)} />
            </label>
            <label className={styles.rangeLabel}>
              Art zoom <output className={styles.rangeOutput}>{selectedCrop.zoom.toFixed(2)}×</output>
              <input className={styles.range} type="range" min="1" max="2" step="0.01" value={selectedCrop.zoom} onChange={(event) => updateSelectedCrop("zoom", event.target.value)} />
            </label>
          </div>
          <div className={styles.export}>
            <span className={styles.exportLabel}>Exportable crop values</span>
            <textarea className={styles.exportArea} aria-label="Exportable crop values" readOnly value={JSON.stringify(exportValues, null, 2)} />
          </div>
        </div>
      ) : null}

      <div className={styles.grid}>
        {filteredChampions.map((champion, index) => {
          const crop = overrides[champion.id] ?? championArtCrop(champion.name, 0);
          const reviewed = isChampionArtReviewed(champion.name, 0);
          const selectedCard = champion.id === selected?.id;
          const winner = auditWinner(champion);
          return (
            <div className={styles.auditItem} key={champion.id}>
              <div className={`${styles.cardShell} ${selectedCard ? styles.cardButtonSelected : ""}`}>
                <button
                  type="button"
                  className={styles.cardButton}
                  aria-label={`Edit ${champion.name} crop`}
                  onClick={() => setSelectedId(champion.id)}
                >
                  <BestOfChampionCard
                    award={AUDIT_AWARD}
                    winner={winner}
                    season="AUDIT"
                    league="premier"
                    headingId={`best-of-audit-${index}-${champion.id}`}
                    division={division === "none" ? undefined : division}
                    crop={crop}
                  />
                </button>
              </div>
              <div className={styles.auditMeta}>
                <span>{champion.id}:0</span>
                <span className={reviewed ? styles.statusReviewed : styles.statusUnreviewed}>{reviewed ? "reviewed" : "fallback"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

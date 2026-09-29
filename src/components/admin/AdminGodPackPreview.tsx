"use client";

import { useState } from "react";
import type { PlayerCardData } from "@/lib/cards/build";
import PackOpening, { type OpenResult, type Pull } from "@/components/cards/PackOpening";
import { GOD_PACK_ODDS_DENOMINATOR } from "@/lib/packs/config";

const SIGNATURE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='48'%3E%3Cpath d='M8 32c32-28 38 14 62-15 14-18 25 16 48-5 9-8 20-3 54-6' fill='none' stroke='%23ffd76a' stroke-width='3'/%3E%3C/svg%3E";

function previewCard(
  slug: string,
  name: string,
  overall: number,
  tier: PlayerCardData["tier"],
  champion: string,
): PlayerCardData {
  return {
    slug,
    name,
    tag: "PREVIEW",
    teamName: "Admin Fixture",
    teamImageUrl: null,
    teamAbbr: "AF",
    role: "Mid",
    overall,
    tier,
    archetype: "Playmaker",
    signature: { champion, games: 42 },
    artSkin: 0,
    motto: "The odds broke.",
    serial: 0,
    collectionSize: 5,
    topChampions: [{ champion, games: 42, wins: 25 }],
    form: [true, true, false, true, true],
    subStats: [{ key: "combat", label: "Combat", value: 94 }],
    highlights: [],
    badges: [],
    standout: false,
    wins: 25,
    losses: 17,
    winratePct: 59.5,
    level: 42,
    pentas: 1,
    season: "GOD-PREVIEW",
  };
}

const previewPulls: Pull[] = [
  { card: previewCard("god-prisma", "Prisma Example", 87, { key: "diamond", label: "Diamond" }, "Ahri"), foil: true, foilType: "prisma", signed: false, inventoryId: -1 },
  { card: previewCard("god-aurora", "Aurora Example", 90, { key: "master", label: "Master" }, "Thresh"), foil: true, foilType: "aurora", signed: false, inventoryId: -2 },
  { card: previewCard("god-refractor", "Refractor Example", 88, { key: "diamond", label: "Diamond" }, "Jinx"), foil: true, foilType: "refractor", signed: false, inventoryId: -3 },
  { card: previewCard("god-ice", "Cracked Ice Example", 91, { key: "master", label: "Master" }, "Lee Sin"), foil: true, foilType: "ice", signed: false, inventoryId: -4 },
  {
    card: { ...previewCard("god-finale", "Signed Finale Example", 95, { key: "challenger", label: "Challenger" }, "Yasuo"), autograph: SIGNATURE },
    foil: true,
    foilType: "refractor",
    signed: true,
    inventoryId: -5,
  },
];

/**
 * A local-only visual fixture. It deliberately never calls a server action,
 * writes inventory, or accepts a force/query parameter: the button simply
 * mounts PackOpening with deterministic mock pulls so staff can review the
 * full ceremony before a real one occurs.
 */
export default function AdminGodPackPreview() {
  const [open, setOpen] = useState(false);
  const previewOpenAgain = async (): Promise<OpenResult> => ({ ok: false, error: "This is an admin preview only." });

  return (
    <section aria-labelledby="god-pack-preview-title" className="card-brand flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <span className="label-dash">Testing fixture</span>
          <h2 id="god-pack-preview-title" className="type-display mt-1 text-2xl">God Pack ceremony</h2>
        </div>
        <span className="text-xs font-bold uppercase tracking-[0.16em] text-gold">
          Local mock · 1 in {GOD_PACK_ODDS_DENOMINATOR.toLocaleString("en-US")}
        </span>
      </div>
      <p className="max-w-3xl text-sm text-muted">
        Preview the obsidian/gold fracture, staged announcement, special foil backs, and signed finale. This fixture
        is deterministic and cannot mint, charge, dust, or open another pack.
      </p>
      <button type="button" onClick={() => setOpen(true)} className="btn-primary w-fit px-5 py-2.5 text-sm" data-testid="god-pack-preview-button">
        Preview God Pack
      </button>
      {open ? (
        <PackOpening
          pulls={previewPulls}
          balance={0}
          packCost={0}
          ownedSlugs={[]}
          muted={false}
          variant="god"
          openingId="admin-god-pack-preview"
          revealOrder={previewPulls.map((pull) => pull.inventoryId)}
          preview
          onOpenAnother={previewOpenAgain}
          onExit={() => setOpen(false)}
        />
      ) : null}
    </section>
  );
}

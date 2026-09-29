"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TeamIdentity } from "@/lib/teams/identity";
import type { BracketModel, BracketRound, ConfirmedBracketEdge } from "@/lib/schedule/bracket";
import BracketMatchCard from "./BracketMatch";
import styles from "./PlayoffBracket.module.css";

function fixtureLabel(model: BracketModel, fixtureId: string): string {
  const match = model.rounds.flatMap((round) => round.matches).find((candidate) => candidate.fixtureId === fixtureId);
  if (!match) return "a previous match";
  return `${match.teamA} vs ${match.teamB}`;
}

function RoundCards({
  round,
  model,
  identities,
  draftedFixtureIds,
  edges,
  editable,
}: {
  round: BracketRound;
  model: BracketModel;
  identities: Record<string, TeamIdentity>;
  draftedFixtureIds: ReadonlySet<string>;
  edges: ConfirmedBracketEdge[];
  editable: boolean;
}) {
  if (round.matches.length === 0) {
    return <p className={styles.emptyRound}>No fixtures published for this round.</p>;
  }
  return round.matches.map((match, index) => {
    const incomingEdge = edges.find((edge) => edge.targetFixtureId === match.fixtureId);
    return (
      <BracketMatchCard
        key={match.fixtureId}
        match={match}
        index={index}
        identities={identities}
        incomingEdge={incomingEdge}
        sourceLabel={incomingEdge ? fixtureLabel(model, incomingEdge.sourceFixtureId) : undefined}
        hasDraft={draftedFixtureIds.has(match.fixtureId)}
        editable={editable}
      />
    );
  });
}

export default function PlayoffBracket({
  model,
  identities,
  draftedFixtureIds,
  variant = "full",
  editable = false,
}: {
  model: BracketModel;
  identities: Record<string, TeamIdentity>;
  draftedFixtureIds: ReadonlySet<string>;
  variant?: "full" | "compact";
  editable?: boolean;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [selectedRound, setSelectedRound] = useState(model.rounds.find((round) => round.matches.length > 0)?.stage ?? "quarterfinals");
  const [showFullBracket, setShowFullBracket] = useState(false);
  const [paths, setPaths] = useState<string[]>([]);

  const updateConnections = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const cards = new Map<string, DOMRect>();
    canvas.querySelectorAll<HTMLElement>("[data-bracket-fixture]").forEach((element) => {
      const id = element.dataset.bracketFixture;
      if (id) cards.set(id, element.getBoundingClientRect());
    });
    const next = model.confirmedEdges.flatMap((edge) => {
      const source = cards.get(edge.sourceFixtureId);
      const target = cards.get(edge.targetFixtureId);
      if (!source || !target) return [];
      const x1 = source.right - bounds.left;
      const y1 = source.top + source.height / 2 - bounds.top;
      const x2 = target.left - bounds.left;
      const y2 = target.top + target.height / 2 - bounds.top;
      const mid = (x1 + x2) / 2;
      return [`M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`];
    });
    setPaths(next);
  }, [model.confirmedEdges]);

  useEffect(() => {
    if (variant === "compact") return;
    let frame = requestAnimationFrame(updateConnections);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateConnections);
    });
    if (canvasRef.current) observer?.observe(canvasRef.current);
    window.addEventListener("resize", updateConnections);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", updateConnections);
    };
  }, [updateConnections, variant, showFullBracket, selectedRound]);

  const selected = useMemo(
    () => model.rounds.find((round) => round.stage === selectedRound) ?? model.rounds[0],
    [model.rounds, selectedRound],
  );
  const roundsClass = `${styles.rounds} ${variant === "compact" ? styles.compact : ""}`;

  const grid = (
    <div className={styles.canvas} ref={canvasRef}>
      <svg className={styles.connections} aria-hidden="true">
        {paths.map((path, index) => <path key={`${path}-${index}`} d={path} fill="none" stroke="var(--color-league-accent)" strokeWidth="1.5" opacity="0.7" />)}
      </svg>
      <div className={roundsClass}>
        {model.rounds.map((round) => (
          <section key={round.stage} className={styles.round} aria-label={round.label}>
            <h3 className={styles.roundTitle}>{round.label}</h3>
            <RoundCards round={round} model={model} identities={identities} draftedFixtureIds={draftedFixtureIds} edges={model.confirmedEdges} editable={editable} />
          </section>
        ))}
      </div>
    </div>
  );

  const roundSelector = (
    <div className={styles.mobileControls}>
      <label className="label-dash" htmlFor={`playoff-round-${variant}`}>Round</label>
      <select id={`playoff-round-${variant}`} value={selected.stage} onChange={(event) => setSelectedRound(event.target.value as typeof selectedRound)}>
        {model.rounds.map((round) => <option key={round.stage} value={round.stage}>{round.label}</option>)}
      </select>
      {variant === "full" ? (
        <button type="button" className="min-h-10 rounded border border-border-subtle px-2 text-xs font-semibold" onClick={() => setShowFullBracket((value) => !value)}>
          {showFullBracket ? "Hide full bracket" : "Full bracket"}
        </button>
      ) : null}
    </div>
  );

  return (
    <div className={`${styles.root} ${variant === "compact" ? styles.compact : ""}`}>
      {model.pairingState === "unpublished" ? (
        <p className="mb-3 rounded border border-border-subtle/70 bg-canvas/50 px-3 py-2 text-sm text-muted">Playoff bracket not published.</p>
      ) : model.pairingState === "partial" ? (
        <p className="mb-3 rounded border border-border-subtle/70 bg-canvas/50 px-3 py-2 text-sm text-muted">Pairings pending. Connections appear only when a recorded winner uniquely matches a published slot.</p>
      ) : null}
      {model.champion ? <p className="mb-3 text-sm font-semibold text-success">Champion: {model.champion}</p> : null}
      {variant === "full" ? (
        <>
          {roundSelector}
          <div className={`${styles.mobileRoundList} md:hidden`}>
            <section aria-label={selected.label} className={styles.round}>
              <h3 className={styles.roundTitle}>{selected.label}</h3>
              <RoundCards round={selected} model={model} identities={identities} draftedFixtureIds={draftedFixtureIds} edges={model.confirmedEdges} editable={editable} />
            </section>
          </div>
          <div className={`${styles.mobileFullBracket} ${showFullBracket ? "block" : "hidden"} md:block`}>
            {grid}
          </div>
        </>
      ) : grid}
    </div>
  );
}

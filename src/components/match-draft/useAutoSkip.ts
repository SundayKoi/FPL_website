"use client";

import { useEffect, useRef } from "react";
import { DRAFT_TURN_SECONDS, LCS_DRAFT_STEPS } from "@/lib/match-draft/rules";
import { draftTurnKey, timeoutRetryable } from "@/lib/match-draft/sync";
import type { MatchDraftState, OpenDraftLobbyHandle } from "@/lib/match-draft/types";
import { sameTeam, saveErrorMessage } from "@/components/match-draft/draftBoardHelpers";
import type { MatchDraftClient } from "@/components/match-draft/useMatchDraftChannel";

type SkipJob = { cancelled: boolean; timer?: ReturnType<typeof setTimeout> };

/**
 * Advances bans whose turn has expired, for every game the viewer may act
 * in. The server decides whether a skip is valid; this only asks once the
 * deadline has passed.
 */
export function useAutoSkip({
  supabase,
  onSave,
  lobby,
  canReset,
  viewerTeamName,
  statesByGame,
  clockOffsetMs,
  draftRpc,
  refreshSnapshot,
  setError,
}: {
  supabase: MatchDraftClient | null;
  onSave?: (state: MatchDraftState) => void | Promise<void>;
  lobby: OpenDraftLobbyHandle | null;
  canReset: boolean;
  viewerTeamName: string | null | undefined;
  statesByGame: Record<number, MatchDraftState>;
  clockOffsetMs: number;
  draftRpc: (client: MatchDraftClient, name: string, params: Record<string, unknown>) => Promise<{ error: unknown }>;
  refreshSnapshot: () => Promise<void>;
  setError: (error: string | null) => void;
}) {
  // Expired bans are scheduled independently of the display tick. A clock
  // skew can make the first request early, so TOO_SOON and transient network
  // failures retry while this exact revision/step/deadline remains current.
  const skipJobsRef = useRef(new Map<string, SkipJob>());
  useEffect(() => {
    const jobs = skipJobsRef.current;
    const wanted = new Set<string>();
    if (supabase && !onSave) {
      for (const candidate of Object.values(statesByGame)) {
        const candidateStep = LCS_DRAFT_STEPS[candidate.currentStepIndex];
        const eligible = candidate.status !== "complete" &&
          (candidate.actions.length > 0 || (candidate.blueReady && candidate.redReady)) &&
          candidate.blueReady && candidate.redReady &&
          candidateStep?.kind === "ban" &&
          (canReset || sameTeam(viewerTeamName, candidate.blueTeam.name) || sameTeam(viewerTeamName, candidate.redTeam.name));
        if (!eligible) continue;
        const deadline = candidate.turnDeadlineAt ?? (candidate.turnStartedAt
          ? new Date(Date.parse(candidate.turnStartedAt) + DRAFT_TURN_SECONDS * 1000).toISOString()
          : null);
        if (!deadline) continue;
        const key = draftTurnKey({ ...candidate, turnDeadlineAt: deadline });
        wanted.add(key);
        if (jobs.has(key)) continue;
        const job: SkipJob = { cancelled: false };
        jobs.set(key, job);
        const attempt = async (delay: number): Promise<void> => {
          job.timer = setTimeout(async () => {
            if (job.cancelled) return;
            try {
              const result = await draftRpc(supabase, "skip_match_draft_step", { p_game: candidate.gameNumber });
              if (!result.error) {
                jobs.delete(key);
                void refreshSnapshot();
                return;
              }
              if (!timeoutRetryable(result.error)) {
                jobs.delete(key);
                setError(saveErrorMessage(result.error, "The expired ban could not be advanced."));
                return;
              }
            } catch (err) {
              if (!timeoutRetryable(err)) {
                jobs.delete(key);
                setError(saveErrorMessage(err, "The expired ban could not be advanced."));
                return;
              }
            }
            if (!job.cancelled) void attempt(Math.min(5000, Math.max(750, delay * 1.5)));
          }, delay);
        };
        void attempt(Math.max(0, Date.parse(deadline) - (Date.now() + clockOffsetMs) + 3250));
      }
    }
    for (const [key, job] of jobs) {
      if (!wanted.has(key)) {
        job.cancelled = true;
        if (job.timer) clearTimeout(job.timer);
        jobs.delete(key);
      }
    }
  }, [canReset, clockOffsetMs, draftRpc, lobby, onSave, refreshSnapshot, setError, statesByGame, supabase, viewerTeamName]);
  useEffect(() => () => {
    for (const job of skipJobsRef.current.values()) {
      job.cancelled = true;
      if (job.timer) clearTimeout(job.timer);
    }
  }, []);
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/client";
import {
  connectionStatusForChannel,
  type LiveConnectionStatus,
} from "@/lib/realtime/connection";
import { emptyDraftState, formatFromSettings, stateFromDraftRow } from "@/lib/match-draft/sync";
import type { MatchDraftRow, MatchDraftSeriesFormat, MatchDraftState, OpenDraftLobbyHandle } from "@/lib/match-draft/types";
import { saveErrorMessage } from "@/components/match-draft/draftBoardHelpers";

export type MatchDraftClient = ReturnType<typeof createClient>;

/** A client's selected-but-not-locked champion, broadcast as a ghost. */
export type DraftIntent = { gameNumber: number; revision?: number; stepIndex: number; champion: string | null };

/**
 * The board's live link: one realtime channel (presence, intent broadcasts,
 * row and settings changes) plus the snapshot catch-up every notification
 * funnels into. Board-owned series state is updated through the setters it
 * passes in; everything else about the connection lives here.
 */
export function useMatchDraftChannel({
  supabase,
  lobby,
  initialState,
  viewerTeamName,
  preview,
  seriesFormatRef,
  setStatesByGame,
  setLiveSeriesFormat,
}: {
  supabase: MatchDraftClient | null;
  lobby: OpenDraftLobbyHandle | null;
  initialState: MatchDraftState;
  viewerTeamName: string | null | undefined;
  /** Preview mode (onSave) has no realtime and reports itself connected. */
  preview: boolean;
  seriesFormatRef: RefObject<MatchDraftSeriesFormat>;
  setStatesByGame: Dispatch<SetStateAction<Record<number, MatchDraftState>>>;
  setLiveSeriesFormat: Dispatch<SetStateAction<MatchDraftSeriesFormat>>;
}) {
  const [onlineTeams, setOnlineTeams] = useState<Set<string>>(new Set());
  const [remoteIntents, setRemoteIntents] = useState<Record<number, DraftIntent>>({});
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const catchupInFlightRef = useRef<Promise<void> | null>(null);
  const catchupRequestedRef = useRef(false);
  const deletedRevisionsRef = useRef<Record<number, number>>({});
  const latestSettingsRevisionRef = useRef<number | undefined>(undefined);
  const [connectionStatus, setConnectionStatus] = useState<LiveConnectionStatus>(
    preview ? "connected" : "connecting",
  );

  const refreshSnapshot = useCallback(async () => {
    if (!supabase) return;
    if (catchupInFlightRef.current) {
      catchupRequestedRef.current = true;
      return catchupInFlightRef.current;
    }
    const request = (async () => {
      try {
        do {
          catchupRequestedRef.current = false;
          const startedAt = Date.now();
          const table = lobby ? "open_drafts" : "match_drafts";
          const scopeColumn = lobby ? "lobby_id" : "fixture_id";
          const scopeValue = lobby?.lobbyId ?? initialState.fixtureId;
          try {
            const rowsPromise = supabase.from(table).select("*").eq(scopeColumn, scopeValue).order("game_number");
            const settingsPromise = lobby
              ? Promise.resolve({ data: null, error: null })
              : supabase.from("match_draft_settings").select("fixture_id, best_of, fearless, revision").eq("fixture_id", initialState.fixtureId).maybeSingle();
            const serverTimePromise = supabase.rpc("match_draft_server_time");
            const [{ data: rows, error: rowsError }, { data: settings, error: settingsError }, { data: serverTime }] = await Promise.all([
              rowsPromise,
              settingsPromise,
              serverTimePromise,
            ]);
            if (rowsError) throw rowsError;
            if (settingsError) throw settingsError;
            const serverMs = typeof serverTime === "string" ? Date.parse(serverTime) : NaN;
            if (Number.isFinite(serverMs)) setClockOffsetMs(serverMs - (startedAt + (Date.now() - startedAt) / 2));

            const settingsRow = settings as { best_of?: number; fearless?: boolean; revision?: number } | null;
            if (settingsRow && (latestSettingsRevisionRef.current === undefined || (settingsRow.revision ?? 0) >= latestSettingsRevisionRef.current)) {
              latestSettingsRevisionRef.current = settingsRow.revision;
              setLiveSeriesFormat((current) => formatFromSettings(current, settingsRow));
            }

            const snapshotRows = (rows ?? []) as MatchDraftRow[];
            setStatesByGame((current) => {
              const next = { ...current };
              const expectedBestOf = settingsRow?.best_of === 1 || settingsRow?.best_of === 5 || settingsRow?.best_of === 3
                ? settingsRow.best_of
                : seriesFormatRef.current.bestOf;
              const rowByGame = new Map(snapshotRows.map((row) => [row.game_number, row]));
              const base = current[1] ?? initialState;
              for (let number = 1; number <= expectedBestOf; number += 1) {
                const existing = current[number] ?? emptyDraftState({ ...base, gameNumber: number });
                const snapshotRow = rowByGame.get(number);
                const deletedRevision = deletedRevisionsRef.current[number];
                const isNewerThanDelete = snapshotRow?.revision === undefined || deletedRevision === undefined || snapshotRow.revision > deletedRevision;
                const reconciled = snapshotRow && isNewerThanDelete
                  ? stateFromDraftRow(existing, snapshotRow)
                  : deletedRevision !== undefined
                    ? emptyDraftState(existing)
                    : existing;
                if (reconciled) next[number] = reconciled;
              }
              return next;
            });
            setSyncError(null);
          } catch (err) {
            setConnectionStatus("reconnecting");
            setSyncError(saveErrorMessage(err, "Live state is temporarily stale."));
          }
        } while (catchupRequestedRef.current);
      } finally {
        catchupInFlightRef.current = null;
      }
    })();
    catchupInFlightRef.current = request;
    return request;
  }, [initialState, lobby, seriesFormatRef, setLiveSeriesFormat, setStatesByGame, supabase]);

  const announceDraftChange = useCallback(() => {
    // Keep the notification payload-free: subscribers refetch through their
    // own RLS-protected client instead of trusting room messages as state.
    void channelRef.current?.send({ type: "broadcast", event: "draft-changed", payload: {} });
  }, []);

  const broadcastIntent = useCallback((intent: DraftIntent) => {
    void channelRef.current?.send({
      type: "broadcast",
      event: "draft-intent",
      payload: intent,
    });
  }, []);

  // Live sync: subscribe first, then reconcile a snapshot. Realtime rows and
  // snapshots share the revision merge rule, so neither ordering can regress
  // the board. Deletes are scoped by their old row identity and treated as a
  // reset; routine recovery never navigates away from the draft.
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel(`${lobby ? "open-draft" : "match-draft"}-${initialState.fixtureId}`)
      .on("presence", { event: "sync" }, () => {
        const present = new Set<string>();
        for (const entries of Object.values(channel.presenceState<{ team?: string }>())) {
          for (const entry of entries) if (entry.team) present.add(entry.team);
        }
        setOnlineTeams((current) => {
          if (current.size === present.size && [...current].every((team) => present.has(team))) return current;
          return present;
        });
      })
      .on("broadcast", { event: "draft-intent" }, ({ payload }) => {
        const intent = payload as DraftIntent;
        if (!Number.isInteger(intent.gameNumber) || !Number.isInteger(intent.stepIndex) || (intent.champion !== null && typeof intent.champion !== "string")) return;
        setRemoteIntents((current) => ({ ...current, [intent.gameNumber]: intent }));
      })
      .on("broadcast", { event: "draft-changed" }, () => {
        void refreshSnapshot();
      })
      .on(
        "postgres_changes",
        lobby
          ? { event: "*", schema: "public", table: "open_drafts", filter: `lobby_id=eq.${lobby.lobbyId}` }
          : { event: "*", schema: "public", table: "match_drafts", filter: `fixture_id=eq.${initialState.fixtureId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deleted = payload.old as { game_number?: number; revision?: number };
            if (deleted.game_number !== undefined) {
              if (deleted.revision !== undefined) deletedRevisionsRef.current[deleted.game_number] = deleted.revision;
              setStatesByGame((current) => current[deleted.game_number!] ? { ...current, [deleted.game_number!]: emptyDraftState(current[deleted.game_number!]) } : current);
            }
            void refreshSnapshot();
            return;
          }
          const row = payload.new as MatchDraftRow;
          if (!Number.isInteger(row.game_number)) return;
          const deletedRevision = deletedRevisionsRef.current[row.game_number];
          if (deletedRevision !== undefined && (row.revision === undefined || row.revision <= deletedRevision)) return;
          if (deletedRevision !== undefined) delete deletedRevisionsRef.current[row.game_number];
          setRemoteIntents((current) => {
            if (!current[row.game_number]) return current;
            const next = { ...current };
            delete next[row.game_number];
            return next;
          });
          setStatesByGame((current) => {
            const base = current[1] ?? initialState;
            const game = current[row.game_number] ?? emptyDraftState({ ...base, gameNumber: row.game_number });
            const reconciled = stateFromDraftRow(game, row);
            return reconciled ? { ...current, [row.game_number]: reconciled } : current;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_draft_settings", filter: `fixture_id=eq.${initialState.fixtureId}` },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          const row = payload.new as { best_of?: number; fearless?: boolean; revision?: number };
          const revision = row.revision;
          if (revision !== undefined && latestSettingsRevisionRef.current !== undefined && revision < latestSettingsRevisionRef.current) return;
          latestSettingsRevisionRef.current = revision;
          setLiveSeriesFormat((current) => formatFromSettings(current, row));
        },
      )
      .subscribe((status) => {
        const next = connectionStatusForChannel(status);
        if (!next) return;
        setConnectionStatus(next);
        if (next === "connected") {
          void channel.track({ team: viewerTeamName?.trim().toLowerCase() ?? "spectator" });
          void refreshSnapshot();
        }
      });
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [initialState, lobby, refreshSnapshot, setLiveSeriesFormat, setStatesByGame, supabase, viewerTeamName]);

  useEffect(() => {
    const resync = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void refreshSnapshot();
    };
    window.addEventListener("focus", resync);
    window.addEventListener("online", resync);
    document.addEventListener("visibilitychange", resync);
    return () => {
      window.removeEventListener("focus", resync);
      window.removeEventListener("online", resync);
      document.removeEventListener("visibilitychange", resync);
    };
  }, [refreshSnapshot]);

  return {
    connectionStatus,
    syncError,
    clockOffsetMs,
    onlineTeams,
    remoteIntents,
    refreshSnapshot,
    announceDraftChange,
    broadcastIntent,
  };
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_OVERLAY_SLOT_WIDTH, type OverlaySlotWidth } from "@/lib/match-draft/overlaySlot";
import { createClient } from "@/lib/supabase/client";
import ConnectionBanner from "@/components/system/ConnectionBanner";
import { CHAMPIONS, championLookup, type ChampionRole, type MatchDraftChampion } from "@/lib/match-draft/champions";
import { actionForStep, DRAFT_TURN_SECONDS, isChampionUnavailable, LCS_DRAFT_STEPS, nextEmptyStepIndex, normalizeChampionName } from "@/lib/match-draft/rules";
import { overtimeSecondsForDeadline } from "@/lib/match-draft/timing";
import { emptyDraftState } from "@/lib/match-draft/sync";
import { draftMatchupViewFromState } from "@/lib/match-draft/presentation";
import { DraftMatchupBoard, sideClass } from "@/components/match-draft/DraftMatchupBoard";
import { MATCH_DRAFT_IMAGE_SIZE_ORDER } from "@/components/match-draft/matchDraftSizes";
import { ChampionPool } from "@/components/match-draft/ChampionPool";
import { CopyLinkButton } from "@/components/match-draft/CopyButtons";
import { ChangeRequestBanner, DraftCompleteBanner, GameResultPanel, ReadyCheckPanel, SideChooser } from "@/components/match-draft/DraftBanners";
import { ImageSizeStepper, SeriesFormatControls, SeriesGameTabs } from "@/components/match-draft/DraftControls";
import { LockInBar } from "@/components/match-draft/LockInBar";
import { RoleOrderModal } from "@/components/match-draft/RoleOrderModal";
import { TurnTimer } from "@/components/match-draft/TurnTimer";
import { sameTeam, saveErrorMessage, teamOnSide, timingForNextStep } from "@/components/match-draft/draftBoardHelpers";
import { flashTitle, playTurnPing } from "@/components/match-draft/turnAlerts";
import { useAutoSkip } from "@/components/match-draft/useAutoSkip";
import { useMatchDraftChannel } from "@/components/match-draft/useMatchDraftChannel";
import { useRoleOrders } from "@/components/match-draft/useRoleOrders";
import type { DraftSide, MatchDraftAction, MatchDraftGameTab, MatchDraftLayout, MatchDraftSeriesFormat, MatchDraftState, OpenDraftLobbyHandle } from "@/lib/match-draft/types";
import type { LeagueView } from "@/lib/league/context";
import styles from "@/components/league/LeagueToolWorkspace.module.css";

// OBS contract: the overlay's portrait slots fill their column up to a cap,
// and the cap is a query switch (?slot=) — see src/lib/match-draft/overlaySlot.ts
// for the rule and the reason it is a plain module. Both classes are spelled
// out so Tailwind emits them.
const OBS_SLOT_CAP: Record<OverlaySlotWidth, string> = { 350: "max-w-[350px]", 700: "max-w-[700px]" };

export default function MatchDraftBoard({
  initialState,
  initialStates,
  viewerTeamName,
  overlay = false,
  champions = CHAMPIONS,
  games = [],
  seriesFormat = { bestOf: 3, fearless: true },
  canReset = false,
  lobby = null,
  followLive = false,
  overlayTransparent = false,
  overlaySlotWidth = DEFAULT_OVERLAY_SLOT_WIDTH,
  tourneyCodes = {},
  reportHref = null,
  league,
  season,
  onSave,
}: {
  initialState: MatchDraftState;
  /** Every game's state for the series — lets the game tabs switch
   *  instantly client-side. Absent (preview/tests), only initialState's
   *  game exists. */
  initialStates?: MatchDraftState[];
  /** The team the signed-in visitor captains in this fixture (null =
   *  spectator). Presentation only — the database RPCs re-check the side. */
  viewerTeamName?: string | null;
  /** Broadcast overlay: bans, picks, and the timer only — no controls. Meant
   *  for an OBS browser source (?overlay=1). */
  overlay?: boolean;
  /** The champion roster — the live Data Dragon list from the server, or
   *  the static fallback bundle. */
  champions?: MatchDraftChampion[];
  /** Game tabs for the whole series — one shared URL, ?game= switches. */
  games?: MatchDraftGameTab[];
  /** The series' drafter format (Bo1/Bo3/Bo5 + fearless), from
   *  match_draft_settings with code defaults when unset. */
  seriesFormat?: MatchDraftSeriesFormat;
  /** Admin-only: renders the reset controls. The database policies are the
   *  real gate; this only controls presentation. */
  canReset?: boolean;
  /** Public /drafter lobby session: mutations go through the token-checked
   *  open_draft_* RPCs and realtime follows open_drafts instead of
   *  match_drafts. state.fixtureId holds the lobby id in this mode. */
  lobby?: OpenDraftLobbyHandle | null;
  /** Overlay only: auto-follow the latest active game so one OBS link covers
   *  the whole series. Pages set it when the URL has no explicit ?game=. */
  followLive?: boolean;
  /** Overlay only (?bg=transparent): no page background, so casters can
   *  layer the overlay over their own scene. */
  overlayTransparent?: boolean;
  /** Overlay only (?slot=700): the cap on a portrait slot's width. */
  overlaySlotWidth?: OverlaySlotWidth;
  /** Fixture drafts: this fixture's tourney codes by game number. The page
   *  fetches them under RLS, so only the two teams' captains (and admins)
   *  ever receive any — spectators get an empty object. */
  tourneyCodes?: Record<number, string>;
  /** Fixture drafts: where "Report this result" points once the series is
   *  decided — the fixture's league's captain page. */
  reportHref?: string | null;
  /** Resolved from the fixture season; token lobbies omit league context. */
  league?: LeagueView;
  season?: string;
  onSave?: (state: MatchDraftState) => void | Promise<void>;
}) {
  const supabase = useMemo(() => (onSave ? null : createClient()), [onSave]);
  // One entry per game so the tabs switch instantly without a navigation.
  const [statesByGame, setStatesByGame] = useState<Record<number, MatchDraftState>>(() =>
    Object.fromEntries((initialStates?.length ? initialStates : [initialState]).map((game) => [game.gameNumber, game])),
  );
  const [gameNumber, setGameNumber] = useState(initialState.gameNumber);
  const [liveSeriesFormat, setLiveSeriesFormat] = useState(seriesFormat);
  const seriesFormatRef = useRef(liveSeriesFormat);
  useEffect(() => {
    seriesFormatRef.current = liveSeriesFormat;
  }, [liveSeriesFormat]);
  // Overlay auto-follow: one OBS link covers the whole series — with no
  // explicit ?game= pin, the broadcast view tracks the latest game that has
  // any activity (actions or a ready check under way).
  const followedGame =
    overlay && followLive
      ? Object.values(statesByGame).reduce(
          (latest, game) =>
            (game.actions.length > 0 || game.blueReady || game.redReady) && game.gameNumber > latest
              ? game.gameNumber
              : latest,
          gameNumber,
        )
      : null;
  const selectedGameNumber = followedGame ?? gameNumber;
  const state = statesByGame[selectedGameNumber] ?? emptyDraftState({ ...initialState, gameNumber: selectedGameNumber });
  const setState = (next: MatchDraftState) =>
    setStatesByGame((current) => ({ ...current, [next.gameNumber]: next }));
  const seriesGames = useMemo(() => {
    const existing = new Map(games.map((game) => [game.gameNumber, game]));
    const formatChanged =
      liveSeriesFormat.bestOf !== seriesFormat.bestOf ||
      liveSeriesFormat.fearless !== seriesFormat.fearless;
    if (games.length > 0 && !formatChanged) return games;
    return Array.from({ length: liveSeriesFormat.bestOf }, (_, index) => {
      const number = index + 1;
      return existing.get(number) ?? {
        gameNumber: number,
        href: lobby ? `/drafter/${lobby.token}?game=${number}` : `/match-draft/${initialState.fixtureId}?game=${number}`,
        status: null,
      };
    });
  }, [games, initialState.fixtureId, liveSeriesFormat.bestOf, liveSeriesFormat.fearless, lobby, seriesFormat.bestOf, seriesFormat.fearless]);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<ChampionRole | null>(null);
  // Two-step drafting: clicking a champion only SELECTS it (broadcast to the
  // room as a ghost); the Lock In button confirms. pendingPick is the
  // viewer's own selection, remoteIntents are the other clients', per game.
  const [pendingPick, setPendingPick] = useState<{ gameNumber: number; revision?: number; stepIndex: number; champion: string } | null>(null);
  const {
    roleModalOpen,
    setRoleModalOpen,
    roleDrag,
    setRoleDrag,
    roleOrderForSide,
    openRoleConfirmation,
    moveRoleTo,
    resetRoleOrders,
  } = useRoleOrders(state);
  const championPoolScrollRef = useRef<HTMLDivElement | null>(null);
  // MD is the compact default; LG is the only larger option.
  const [imageSizeIndex, setImageSizeIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  // Two clicks to pass: forfeiting a ban is a real cost, and the button
  // sits where a captain's cursor already is during their turn.
  //
  // Stored as the step being confirmed rather than a bare boolean, so a
  // half-confirmed pass left over from an earlier step just stops applying
  // — same reasoning as pendingPick below. Clearing it from an effect
  // instead would leave the next captain one click from forfeiting a ban
  // they never meant to, in the window before the effect ran.
  const [confirmingPassAt, setConfirmingPassAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentStep = LCS_DRAFT_STEPS[state.currentStepIndex] ?? LCS_DRAFT_STEPS[LCS_DRAFT_STEPS.length - 1];
  const currentAction = currentStep ? actionForStep(state.actions, currentStep) : null;
  const resolveChampion = useMemo(() => championLookup(champions), [champions]);
  const filteredChampions = useMemo(
    () => champions.filter(
      (champion) =>
        champion.name.toLowerCase().includes(query.trim().toLowerCase()) &&
        (!roleFilter || champion.roles.includes(roleFilter)),
    ),
    [champions, query, roleFilter],
  );
  useEffect(() => {
    if (championPoolScrollRef.current) championPoolScrollRef.current.scrollTop = 0;
  }, [query, roleFilter]);
  const imageSize = MATCH_DRAFT_IMAGE_SIZE_ORDER[imageSizeIndex];
  const blockedChampions = useMemo(() => {
    const priorPicks = Object.values(statesByGame)
      .filter((game) => game.gameNumber < gameNumber)
      .flatMap((game) =>
        game.actions
          .filter((action) => action.kind === "pick")
          .map((action) => action.champion)
          .filter((champion): champion is string => Boolean(champion)),
      );
    return liveSeriesFormat.fearless ? [...new Set([...(onSave ? state.blockedChampions : []), ...priorPicks])] : [];
  }, [liveSeriesFormat.fearless, onSave, state.blockedChampions, statesByGame, gameNumber]);
  // Which game took each blocked champion, for the pool's G1/G2 badge. Same
  // server-plus-live merge as blockedChampions above, so a champion picked in
  // game 1 while game 2 is open badges the moment it lands. Display only.
  const blockedGames = useMemo(() => {
    if (!liveSeriesFormat.fearless) return {};
    const merged: Record<string, number> = onSave ? { ...(state.blockedGames ?? {}) } : {};
    for (const game of Object.values(statesByGame)) {
      if (game.gameNumber >= gameNumber) continue;
      for (const action of game.actions) {
        if (action.kind !== "pick" || !action.champion?.trim()) continue;
        const key = normalizeChampionName(action.champion);
        if (merged[key] === undefined || game.gameNumber < merged[key]) merged[key] = game.gameNumber;
      }
    }
    return merged;
  }, [liveSeriesFormat.fearless, onSave, state.blockedGames, statesByGame, gameNumber]);
  const viewerSide: DraftSide | null = sameTeam(viewerTeamName, state.blueTeam.name)
    ? "blue"
    : sameTeam(viewerTeamName, state.redTeam.name)
      ? "red"
      : null;
  // Admins act for any side; captains only for theirs; spectators never.
  // Preview mode (onSave) without a viewer identity keeps full access.
  const mayActFor = (side: DraftSide) =>
    canReset || (onSave !== undefined && viewerTeamName === undefined) || viewerSide === side;
  const draftStarted = state.actions.length > 0;
  const bothReady = state.blueReady && state.redReady;
  const drafting = state.status !== "complete";
  const clockRunning = drafting && (draftStarted || bothReady);
  const pendingOvertime = {
    blue: Math.max(0, state.bluePendingOvertimeSeconds),
    red: Math.max(0, state.redPendingOvertimeSeconds),
  } as const;

  const {
    connectionStatus,
    syncError,
    clockOffsetMs,
    onlineTeams,
    remoteIntents,
    refreshSnapshot,
    announceDraftChange,
    broadcastIntent,
  } = useMatchDraftChannel({
    supabase,
    lobby,
    initialState,
    viewerTeamName,
    preview: Boolean(onSave),
    seriesFormatRef,
    setStatesByGame,
    setLiveSeriesFormat,
  });

  const commitMutation = (next: MatchDraftState) => {
    // Preview mode has no realtime authority. Live mode waits for the row
    // event/snapshot instead of installing a pre-request object after await.
    if (onSave || state.revision === undefined) setState(next);
    else void refreshSnapshot();
  };

  const setLayout = (layout: MatchDraftLayout) => setState({ ...state, layout });
  const captainOnline = (side: DraftSide): boolean | undefined =>
    onSave ? undefined : onlineTeams.has(teamForSide(side).name.trim().toLowerCase());
  const teamForSide = (side: DraftSide) => teamOnSide(state, side);
  const playersForSide = (side: DraftSide) => teamForSide(side).players;
  // Null when the team has no roster (public lobbies without entered names):
  // the slot then shows just the champion instead of a placeholder.
  const playerForCurrentPick = (side: DraftSide, slot?: number) => playersForSide(side)[(slot ?? 1) - 1] ?? null;

  const persist = async (next: MatchDraftState) => {
    if (onSave) {
      await onSave(next);
      return;
    }
    if (!supabase) return;
    const { error: saveError } = await supabase.from("match_drafts").upsert({
      fixture_id: next.fixtureId,
      game_number: next.gameNumber,
      status: next.status,
      layout: next.layout,
      current_step_index: next.currentStepIndex,
      turn_started_at: next.turnStartedAt,
      turn_deadline_at: next.turnDeadlineAt,
      turn_allowance_seconds: next.turnAllowanceSeconds,
      blue_pending_overtime_seconds: next.bluePendingOvertimeSeconds,
      red_pending_overtime_seconds: next.redPendingOvertimeSeconds,
      blue_team_name: next.blueTeam.name,
      red_team_name: next.redTeam.name,
      blue_ready: next.blueReady,
      red_ready: next.redReady,
      actions: next.actions,
    }, { onConflict: "fixture_id,game_number" });
    if (saveError) throw saveError;
  };

  // A selection left over from an earlier step just stops applying — no
  // effect-driven state clearing needed.
  const activePendingPick = pendingPick &&
    pendingPick.gameNumber === state.gameNumber &&
    pendingPick.revision === state.revision &&
    pendingPick.stepIndex === state.currentStepIndex ? pendingPick : null;

  /** Fixture drafts call the match_draft_* RPCs keyed by fixture; public
   *  lobbies call their token-checked open_draft_* twins (same names with
   *  "match_draft" swapped for "open_draft", p_token instead of p_fixture). */
  const draftRpc = useCallback(
    async (client: NonNullable<typeof supabase>, name: string, params: Record<string, unknown>) => {
      const result = await (lobby
        ? client.rpc(name.replace("match_draft", "open_draft"), { p_token: lobby.token, ...params })
        : client.rpc(name, { p_fixture: state.fixtureId, ...params }));
      if (!result.error) announceDraftChange();
      return result;
    },
    [announceDraftChange, lobby, state.fixtureId],
  );

  const sendIntent = (champion: string | null) => {
    broadcastIntent({ gameNumber: state.gameNumber, revision: state.revision, stepIndex: state.currentStepIndex, champion });
  };

  /** Step one of drafting: select a champion as your intent (ghosted for the
   *  whole room); Lock In confirms it. */
  const chooseChampion = (champion: string) => {
    if (!currentStep || state.status === "complete" || !mayActFor(currentStep.side)) return;
    setPendingPick({ gameNumber: state.gameNumber, revision: state.revision, stepIndex: currentStep.index, champion });
    sendIntent(champion);
  };

  const lockIn = async () => {
    if (!activePendingPick || activePendingPick.stepIndex !== currentStep?.index) return;
    const saved = await selectChampion(activePendingPick.champion);
    if (saved) {
      setPendingPick(null);
      sendIntent(null);
    }
  };

  const intentFor = (stepIndex: number): string | null => {
    if (state.status === "complete" || stepIndex !== state.currentStepIndex) return null;
    if (activePendingPick?.stepIndex === stepIndex) return activePendingPick.champion;
    const remote = remoteIntents[state.gameNumber];
    return remote && remote.revision === state.revision && remote.stepIndex === stepIndex ? remote.champion : null;
  };

  const selectChampion = async (champion: string): Promise<boolean> => {
    // A completed draft is locked — the final pick must not be replaceable.
    if (state.status === "complete") return false;
    const started = state.actions.length > 0;
    const ready = state.blueReady && state.redReady;
    if (!started && !ready) return false;
    if (!currentStep || state.sideChoiceRequired || isChampionUnavailable(champion, state.actions, blockedChampions)) return false;
    if (!mayActFor(currentStep.side)) return false;
    const nextActions = state.actions.filter((action) => {
      if (typeof action.stepIndex === "number") return action.stepIndex !== currentStep.index;
      return !(action.side === currentStep.side && action.kind === currentStep.kind && action.slot === currentStep.slot);
    });
    const appended: MatchDraftAction[] = [
      ...nextActions,
      {
        stepIndex: currentStep.index,
        side: currentStep.side,
        kind: currentStep.kind,
        slot: currentStep.slot,
        champion,
        playerName: currentStep.kind === "pick" ? playerForCurrentPick(currentStep.side, currentStep.slot) : null,
      },
    ];
    // Advancement mirrors the database: jump to the next EMPTY step so a
    // reopened change-request step gets drafted before play resumes.
    const nextStepIndex = nextEmptyStepIndex(appended);
    const committedAt = new Date().toISOString();
    const committedAtMs = Date.parse(committedAt);
    const pendingBefore = pendingOvertime[currentStep.side];
    const activeDeadline = state.turnDeadlineAt ?? (state.turnStartedAt ? new Date(new Date(state.turnStartedAt).getTime() + DRAFT_TURN_SECONDS * 1000).toISOString() : null);
    const overtime = currentStep.kind === "pick" ? overtimeSecondsForDeadline(activeDeadline, committedAtMs) : 0;
    // Only a pick consumes/replaces that side's pending debt.  A ban can
    // advance the draft between two picks without changing the allowance the
    // next pick will receive.
    const nextPending = currentStep.kind === "pick"
      ? { ...pendingOvertime, [currentStep.side]: overtime }
      : pendingOvertime;
    const nextTiming = timingForNextStep(nextStepIndex, committedAt, nextPending);
    const next: MatchDraftState = {
      ...state,
      currentStepIndex: nextStepIndex ?? LCS_DRAFT_STEPS.length - 1,
      status: nextStepIndex === null ? "complete" : "drafting",
      ...nextTiming,
      bluePendingOvertimeSeconds: nextPending.blue,
      redPendingOvertimeSeconds: nextPending.red,
      actions: appended,
    };
    next.actions[next.actions.length - 1] = {
      ...next.actions[next.actions.length - 1],
      overtimeSeconds: overtime,
      pendingOvertimeBeforeSeconds: pendingBefore,
    };
    setSaving(true);
    setError(null);
    try {
      if (onSave) {
        await persist(next);
      } else if (supabase) {
        const { error: rpcError } = await draftRpc(supabase, "apply_match_draft_action", {
          p_game: state.gameNumber,
          p_step: currentStep.index,
          p_champion: champion,
          p_player_name: currentStep.kind === "pick" ? playerForCurrentPick(currentStep.side, currentStep.slot) : null,
        });
        if (rpcError) throw rpcError;
      }
      commitMutation(next);
      return true;
    } catch (err) {
      setError(saveErrorMessage(err, "Draft could not be saved."));
      return false;
    } finally {
      setSaving(false);
    }
  };

  /**
   * Decline the ban that is currently up.
   *
   * A team can lose a ban — a sub who never got one, a penalty, a house
   * rule — and until now the only way to record that was to let the clock
   * run out, which meant 33 seconds of dead air for a decision already
   * made. The server enforces the rules (your own side, bans only); this
   * just asks.
   *
   * The action written is identical to a timeout skip, so the board, the
   * summary and the change-request flow all render it already, and a ban
   * passed by mistake can be reopened like any other step.
   */
  const passBan = async () => {
    if (!currentStep || currentStep.kind !== "ban") return;
    const appended: MatchDraftAction[] = [
      ...state.actions.filter((action) => action.stepIndex !== currentStep.index),
      {
        stepIndex: currentStep.index,
        side: currentStep.side,
        kind: currentStep.kind,
        slot: currentStep.slot,
        champion: null,
        skipped: true,
      },
    ];
    const nextStepIndex = nextEmptyStepIndex(appended);
    const committedAt = new Date().toISOString();
    const nextTiming = timingForNextStep(nextStepIndex, committedAt, pendingOvertime);
    const next: MatchDraftState = {
      ...state,
      currentStepIndex: nextStepIndex ?? LCS_DRAFT_STEPS.length - 1,
      status: nextStepIndex === null ? "complete" : "drafting",
      ...nextTiming,
      actions: appended,
    };
    setSaving(true);
    setError(null);
    try {
      if (onSave) {
        await persist(next);
      } else if (supabase) {
        const { error: rpcError } = await draftRpc(supabase, "pass_match_draft_step", {
          p_game: state.gameNumber,
        });
        if (rpcError) throw rpcError;
      }
      setPendingPick(null);
      sendIntent(null);
      commitMutation(next);
      setConfirmingPassAt(null);
    } catch (err) {
      setError(saveErrorMessage(err, "Could not pass the ban."));
    } finally {
      setSaving(false);
    }
  };

  const chooseBlueTeam = async (blueTeam: MatchDraftState["blueTeam"]) => {
    if (!state.canChooseSides || state.actions.length > 0) return;
    const redTeam = state.scheduledTeams.find((team) => team.name !== blueTeam.name) ?? state.redTeam;
    const next: MatchDraftState = { ...state, blueTeam, redTeam, sideChoiceRequired: false };
    setSaving(true);
    setError(null);
    try {
      if (onSave) {
        await persist(next);
      } else if (supabase) {
        const { error: rpcError } = await draftRpc(supabase, "choose_match_draft_blue", {
          p_game: state.gameNumber,
          p_blue_name: blueTeam.name,
        });
        if (rpcError) throw rpcError;
      }
      commitMutation(next);
    } catch (err) {
      setError(saveErrorMessage(err, "Sides could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  const toggleReady = async (side: DraftSide) => {
    if (state.sideChoiceRequired || draftStarted || !mayActFor(side)) return;
    const nextReady = side === "blue" ? !state.blueReady : !state.redReady;
    const next: MatchDraftState = {
      ...state,
      blueReady: side === "blue" ? nextReady : state.blueReady,
      redReady: side === "red" ? nextReady : state.redReady,
    };
    // Both just went ready: the first turn's clock starts now.
    if (next.blueReady && next.redReady) {
      const startedAt = new Date().toISOString();
      Object.assign(next, timingForNextStep(0, startedAt, { blue: 0, red: 0 }));
      next.bluePendingOvertimeSeconds = 0;
      next.redPendingOvertimeSeconds = 0;
    } else {
      next.turnStartedAt = null;
      next.turnDeadlineAt = null;
      next.turnAllowanceSeconds = null;
    }
    setSaving(true);
    setError(null);
    try {
      if (onSave) {
        await persist(next);
      } else if (supabase) {
        const { error: rpcError } = await draftRpc(supabase, "set_match_draft_ready", {
          p_game: state.gameNumber,
          p_side: side,
          p_ready: nextReady,
        });
        if (rpcError) throw rpcError;
      }
      commitMutation(next);
    } catch (err) {
      setError(saveErrorMessage(err, "Ready check could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  const requestChange = async (stepIndex: number) => {
    if (!supabase || state.changeRequest) return;
    const action = state.actions.find((entry) => entry.stepIndex === stepIndex);
    if (!action?.side) return;
    setError(null);
    try {
      const { error: rpcError } = await draftRpc(supabase, "request_match_draft_change", {
        p_game: state.gameNumber,
        p_step: stepIndex,
      });
      if (rpcError) throw rpcError;
      void refreshSnapshot();
    } catch (err) {
      setError(saveErrorMessage(err, "Change request could not be sent."));
    }
  };

  const respondChange = async (approve: boolean) => {
    if (!supabase || !state.changeRequest) return;
    setSaving(true);
    setError(null);
    try {
      const { error: rpcError } = await draftRpc(supabase, "respond_match_draft_change", {
        p_game: state.gameNumber,
        p_approve: approve,
      });
      if (rpcError) throw rpcError;
      void refreshSnapshot();
    } catch (err) {
      setError(saveErrorMessage(err, "The response could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  /** Toggle the game's recorded winner (clicking the current winner clears
   *  it — mis-clicks happen). Captains only; fixture drafts and public
   *  lobbies go through their respective RPC twins via draftRpc. */
  const setWinner = async (teamName: string) => {
    if (!supabase) return;
    const next = state.winnerTeam && sameTeam(state.winnerTeam, teamName) ? null : teamName;
    setSaving(true);
    setError(null);
    try {
      const { error: rpcError } = await draftRpc(supabase, "set_match_draft_winner", {
        p_game: state.gameNumber,
        p_team: next,
      });
      if (rpcError) throw rpcError;
      commitMutation({ ...state, winnerTeam: next });
    } catch (err) {
      setError(saveErrorMessage(err, "The result could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  // Series score across the series' games, counted by TEAM (sides swap).
  const seriesWins = (team: MatchDraftState["blueTeam"]) =>
    Object.values(statesByGame).filter((game) => sameTeam(game.winnerTeam, team.name)).length;
  const winsA = seriesWins(state.scheduledTeams[0]);
  const winsB = seriesWins(state.scheduledTeams[1]);
  const winsNeeded = Math.floor(liveSeriesFormat.bestOf / 2) + 1;
  const seriesWinner =
    winsA >= winsNeeded ? state.scheduledTeams[0] : winsB >= winsNeeded ? state.scheduledTeams[1] : null;

  const saveRoles = async (side: DraftSide) => {
    if (!supabase) return;
    const order = roleOrderForSide(side);
    setSaving(true);
    setError(null);
    try {
      const { error: rpcError } = await draftRpc(supabase, "set_match_draft_positions", {
        p_game: state.gameNumber,
        p_side: side,
        p_champions: order,
      });
      if (rpcError) throw rpcError;
      const positions = { ...(state.positions ?? {}), [side]: order };
      if (positions.blue && positions.red) setRoleModalOpen(false);
      if (state.revision === undefined) setState({ ...state, positions });
      else void refreshSnapshot();
    } catch (err) {
      setError(saveErrorMessage(err, "Roles could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  const undoLast = async () => {
    if (!supabase) return;
    if (!window.confirm("Undo the last locked step?")) return;
    setSaving(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc("undo_match_draft_last", {
        p_fixture: state.fixtureId,
        p_game: state.gameNumber,
      });
      if (rpcError) throw rpcError;
      announceDraftChange();
      void refreshSnapshot();
    } catch (err) {
      setError(saveErrorMessage(err, "Undo failed."));
    } finally {
      setSaving(false);
    }
  };

  useAutoSkip({
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
  });

  // Ping + flash the tab when a NEW turn becomes the viewer's.
  const lastTurnKey = useRef<string | null>(null);
  const myTurn = Boolean(clockRunning && currentStep && viewerSide === currentStep.side);
  useEffect(() => {
    if (onSave) return;
    const key = clockRunning && currentStep ? `${gameNumber}:${currentStep.index}` : null;
    if (key && key !== lastTurnKey.current && myTurn) {
      playTurnPing();
      flashTitle();
    }
    lastTurnKey.current = key;
  }, [onSave, clockRunning, currentStep, myTurn, gameNumber]);

  /** ↺ affordance for a drafted step the viewer may ask to redo. */
  const requestChangeFor = (stepIndex: number): (() => void) | null => {
    if (onSave || !supabase || state.changeRequest) return null;
    const action = state.actions.find((entry) => entry.stepIndex === stepIndex);
    if (!action?.side) return null;
    if (!(canReset || viewerSide === action.side)) return null;
    return () => void requestChange(stepIndex);
  };

  const saveSeriesFormat = async (change: Partial<MatchDraftSeriesFormat>) => {
    if (!supabase) return;
    const next = { ...liveSeriesFormat, ...change };
    setSaving(true);
    setError(null);
    try {
      const { error: saveError } = await supabase.from("match_draft_settings").upsert(
        { fixture_id: state.fixtureId, best_of: next.bestOf, fearless: next.fearless },
        { onConflict: "fixture_id" },
      );
      if (saveError) throw saveError;
      // The settings change is delivered to every viewer on the same channel;
      // the next snapshot creates/removes game tabs and recomputes fearless.
      announceDraftChange();
      await refreshSnapshot();
    } catch (err) {
      setError(saveErrorMessage(err, "Format could not be saved."));
      setSaving(false);
    }
  };

  const resetDraft = async (scope: "game" | "series") => {
    if (!supabase) return;
    const label = scope === "game" ? `game ${state.gameNumber}'s draft` : "every game's draft in this series";
    if (!window.confirm(`Reset ${label}? This cannot be undone.`)) return;
    setSaving(true);
    setError(null);
    try {
      if (lobby) {
        const { error: rpcError } = await supabase.rpc("reset_open_draft", {
          p_token: lobby.token,
          p_game: scope === "game" ? state.gameNumber : null,
        });
        if (rpcError) throw rpcError;
      } else {
        const { error: resetError } = await supabase.rpc("reset_match_draft", {
          p_fixture: state.fixtureId,
          p_game: scope === "game" ? state.gameNumber : null,
        });
        if (resetError) throw resetError;
      }
      announceDraftChange();
      // Realtime delivers the scoped delete; the snapshot also catches a
      // delete committed during the subscription gap.
      await refreshSnapshot();
    } catch (err) {
      setError(saveErrorMessage(err, "Draft could not be reset."));
      setSaving(false);
    }
  };

  const switchGame = (game: MatchDraftGameTab) => {
    if (!statesByGame[game.gameNumber]) return;
    setGameNumber(game.gameNumber);
    resetRoleOrders();
    setPendingPick(null);
    // Keep the URL shareable/refreshable without a navigation.
    window.history.replaceState(null, "", game.href);
  };

  const gameTabs = seriesGames.length > 1 ? (
    <SeriesGameTabs games={seriesGames} activeGameNumber={state.gameNumber} statesByGame={statesByGame} onSelect={switchGame} />
  ) : null;

  const lockInBar = activePendingPick ? (
    <LockInBar
      champion={activePendingPick.champion}
      resolve={resolveChampion}
      currentStep={currentStep}
      saving={saving}
      onCancel={() => {
        setPendingPick(null);
        sendIntent(null);
      }}
      onLockIn={() => void lockIn()}
    />
  ) : null;

  // The code for the game being viewed — captains-only by construction
  // (spectators receive an empty tourneyCodes object; see the prop doc).
  const currentTourneyCode = tourneyCodes[state.gameNumber] ?? null;
  const rolesFullyReady = Boolean(state.positions?.blue && state.positions?.red);
  const canConfirmRoles = !onSave && state.status === "complete" && Boolean(viewerSide || canReset);
  const roleModalVisible = canConfirmRoles && (roleModalOpen || !rolesFullyReady);

  const completeBanner = state.status === "complete" ? (
    <DraftCompleteBanner
      tourneyCode={currentTourneyCode}
      hasGameTabs={seriesGames.length > 1}
      canAdjustRoles={canConfirmRoles && rolesFullyReady}
      saving={saving}
      onAdjustRoles={openRoleConfirmation}
    />
  ) : null;

  const winnerPicker = !onSave && state.status === "complete" ? (
    <GameResultPanel
      state={state}
      canRecord={Boolean(viewerSide || canReset)}
      saving={saving}
      winsA={winsA}
      winsB={winsB}
      bestOf={liveSeriesFormat.bestOf}
      reportHref={!lobby && seriesWinner ? reportHref : null}
      onSetWinner={(teamName) => void setWinner(teamName)}
    />
  ) : null;

  const roleModal = roleModalVisible ? (
    <RoleOrderModal
      state={state}
      canReset={canReset}
      viewerSide={viewerSide}
      saving={saving}
      roleModalOpen={roleModalOpen}
      rolesFullyReady={rolesFullyReady}
      roleOrderForSide={roleOrderForSide}
      resolveChampion={resolveChampion}
      roleDrag={roleDrag}
      onRoleDragChange={setRoleDrag}
      moveRoleTo={moveRoleTo}
      onClose={() => setRoleModalOpen(false)}
      onReady={(side) => void saveRoles(side)}
    />
  ) : null;

  const changeBanner = state.changeRequest ? (
    <ChangeRequestBanner
      request={state.changeRequest}
      requester={teamForSide(state.changeRequest.side).abbreviation}
      preview={Boolean(onSave)}
      canReset={canReset}
      viewerSide={viewerSide}
      saving={saving}
      onRespond={(approve) => void respondChange(approve)}
    />
  ) : null;

  const readyCheck = drafting && !draftStarted ? (
    <ReadyCheckPanel
      state={state}
      bothReady={bothReady}
      saving={saving}
      mayActFor={mayActFor}
      onToggleReady={(side) => void toggleReady(side)}
    />
  ) : null;

  const sideChooser = state.canChooseSides && state.actions.length === 0 ? (
    <SideChooser state={state} saving={saving} onChooseBlue={(team) => void chooseBlueTeam(team)} />
  ) : null;

  // Only on a BAN, only on your own turn, only while the draft is live.
  // Picks are excluded here and refused by the server too: a passed pick
  // is a team playing four against five, which nobody clicks on purpose.
  const passStepKey = `${state.gameNumber}:${state.currentStepIndex}`;
  const confirmingPass = confirmingPassAt === passStepKey;
  const canPassBan = Boolean(
    drafting &&
      bothReady &&
      currentStep &&
      currentStep.kind === "ban" &&
      mayActFor(currentStep.side) &&
      !state.changeRequest,
  );

  const championPool = (
    <ChampionPool
      layout={state.layout}
      query={query}
      onQueryChange={setQuery}
      roleFilter={roleFilter}
      onRoleFilterChange={setRoleFilter}
      canPassBan={canPassBan}
      confirmingPass={confirmingPass}
      onStartPass={() => setConfirmingPassAt(passStepKey)}
      onCancelPass={() => setConfirmingPassAt(null)}
      onConfirmPass={() => void passBan()}
      saving={saving}
      scrollRef={championPoolScrollRef}
      imageSize={imageSize}
      champions={filteredChampions}
      actions={state.actions}
      blockedChampions={blockedChampions}
      blockedGames={blockedGames}
      selectedChampion={activePendingPick?.champion}
      pickDisabled={saving || state.sideChoiceRequired || state.status === "complete" || (!draftStarted && !bothReady) || !currentStep || !mayActFor(currentStep.side)}
      onChoose={chooseChampion}
    />
  );

  // The turn clock card — center column on stage, top strip on board.
  const timerCard = <TurnTimer state={state} currentStep={currentStep} clockRunning={clockRunning} clockOffsetMs={clockOffsetMs} />;
  const compactTimerCard = <TurnTimer state={state} currentStep={currentStep} clockRunning={clockRunning} clockOffsetMs={clockOffsetMs} compact />;

  const matchupView = draftMatchupViewFromState(state, { clockRunning });

  const stage = (
    <section className="flex flex-col gap-4" aria-label="Stage draft layout">
      <DraftMatchupBoard
        view={matchupView}
        imageSize={imageSize}
        resolve={resolveChampion}
        intentFor={intentFor}
        requestChangeFor={requestChangeFor}
        online={{ blue: captainOnline("blue"), red: captainOnline("red") }}
        renderRail={() => timerCard}
      />
      {championPool}
    </section>
  );

  const board = (
    <section className="flex flex-col gap-4" aria-label="Board draft layout">
      <DraftMatchupBoard
        view={matchupView}
        layout="columns"
        imageSize={imageSize}
        resolve={resolveChampion}
        intentFor={intentFor}
        requestChangeFor={requestChangeFor}
        online={{ blue: captainOnline("blue"), red: captainOnline("red") }}
        renderRail={() => timerCard}
        renderCompactRail={() => compactTimerCard}
      >
        {championPool}
      </DraftMatchupBoard>
    </section>
  );

  if (overlay) {
    // OBS browser source: teams, picks, bans, and the clock — nothing else.
    return (
      <main className={`flex w-full flex-col gap-4 p-4 text-white ${overlayTransparent ? "bg-transparent" : "bg-canvas"}`}>
        {connectionStatus !== "connected" || syncError ? (
          <div className="max-w-md text-xs" data-testid="match-draft-overlay-connection">
            <ConnectionBanner status={connectionStatus} onRetry={() => void refreshSnapshot()} />
            {syncError ? <p role="alert" className="mt-1 rounded bg-canvas/80 px-2 py-1 text-red-300">{syncError}</p> : null}
          </div>
        ) : null}
        <DraftMatchupBoard
          view={matchupView}
          imageSize="lg"
          resolve={resolveChampion}
          online={{ blue: captainOnline("blue"), red: captainOnline("red") }}
          slotClassName={(pick) => pick.side === "red" ? `${OBS_SLOT_CAP[overlaySlotWidth]} justify-self-end` : OBS_SLOT_CAP[overlaySlotWidth]}
          renderRail={() => (
            <div className="flex min-w-32 flex-col items-center justify-center rounded border border-border-subtle bg-surface px-4 py-4 text-center">
              <TurnTimer state={state} currentStep={currentStep} clockRunning={clockRunning} clockOffsetMs={clockOffsetMs} />
            </div>
          )}
        />
      </main>
    );
  }

  return (
    <main data-league={league} className={`${styles.workspace} mx-auto flex w-full max-w-[2400px] flex-1 flex-col gap-4 page-backdrop px-4 py-6 text-white md:px-6 lg:px-8`}>
      <header className="card-brand flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          {league ? <span className="label-dash">{league === "academy" ? "FPL Academy" : "Premier League"}{season ? ` · ${season}` : ""}</span> : null}
          <span className="label-dash">
            Bo{liveSeriesFormat.bestOf}{liveSeriesFormat.fearless ? " fearless" : ""} · Game {state.gameNumber}
            {lobby && winsA + winsB > 0
              ? ` · ${state.scheduledTeams[0].abbreviation} ${winsA}–${winsB} ${state.scheduledTeams[1].abbreviation}`
              : ""}
          </span>
          <h1 className="type-display mt-1 text-2xl text-white">
            {state.blueTeam.abbreviation} vs {state.redTeam.abbreviation}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {gameTabs}
          <button type="button" aria-pressed={state.layout === "stage"} onClick={() => setLayout("stage")} className="btn-pill px-3 py-1.5 text-xs">
            Stage layout
          </button>
          <button type="button" aria-pressed={state.layout === "board"} onClick={() => setLayout("board")} className="btn-pill px-3 py-1.5 text-xs">
            Board layout
          </button>
          {(canReset || (lobby && viewerSide)) && !onSave ? (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => void resetDraft("game")}
                className="rounded-full border border-red-400/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-red-400 transition hover:bg-red-500/15 disabled:opacity-40"
              >
                Reset game
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void resetDraft("series")}
                className="rounded-full border border-red-400/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-red-400 transition hover:bg-red-500/15 disabled:opacity-40"
              >
                Reset series
              </button>
              {!lobby ? (
                <button
                  type="button"
                  disabled={saving || state.actions.length === 0}
                  onClick={() => void undoLast()}
                  className="rounded-full border border-gold/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gold transition hover:bg-gold/15 disabled:opacity-40"
                >
                  Undo last
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </header>

      <ConnectionBanner status={connectionStatus} onRetry={() => void refreshSnapshot()} />
      {syncError ? <p role="alert" className="text-sm text-amber-300">{syncError}</p> : null}

      {completeBanner}
      {winnerPicker}
      {roleModal}
      {changeBanner}
      {sideChooser}
      {readyCheck}

      <section className="card-brand flex flex-wrap items-end gap-3 p-3">
        {!onSave && !lobby ? (
          <SeriesFormatControls format={liveSeriesFormat} saving={saving} onChange={saveSeriesFormat} />
        ) : null}
        {!lobby && !onSave ? (
          // Public lobbies hand out their three secret links at creation;
          // fixture drafts share one URL for everyone, plus the OBS source.
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Share links">
            <span className="label-dash">Share</span>
            <CopyLinkButton label="Spectator link" path={`/match-draft/${state.fixtureId}`} />
            <CopyLinkButton label="OBS overlay" path={`/match-draft/${state.fixtureId}?overlay=1&bg=transparent`} />
          </div>
        ) : null}
        <ImageSizeStepper index={imageSizeIndex} onIndexChange={setImageSizeIndex} />
        {!onSave || viewerTeamName !== undefined ? (
          <span
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
              canReset ? "border-gold/50 text-gold" : viewerSide ? sideClass[viewerSide] : "border-border-subtle text-muted"
            }`}
          >
            {canReset ? "Admin — full control" : viewerSide ? `Drafting for ${teamForSide(viewerSide).abbreviation} (${viewerSide} side)` : "Spectating"}
          </span>
        ) : null}
        <p className="text-sm text-muted">
          {state.status === "complete" ? (
            "Draft complete"
          ) : (
            <>
              Current turn: <span className="font-semibold uppercase text-white">{currentStep?.side} {currentStep?.kind} {currentStep?.slot}</span>
              {currentAction ? <span> · locked {currentAction.champion}</span> : null}
            </>
          )}
        </p>
        {error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}
      </section>

      {state.layout === "stage" ? stage : board}
      {lockInBar}
    </main>
  );
}

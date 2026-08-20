"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { CHAMPIONS, championLookup, type ChampionRole, type MatchDraftChampion } from "@/lib/match-draft/champions";
import { actionForStep, DRAFT_TURN_SECONDS, isChampionUnavailable, LCS_DRAFT_STEPS, nextEmptyStepIndex } from "@/lib/match-draft/rules";
import type { DraftActionKind, DraftSide, MatchDraftAction, MatchDraftBestOf, MatchDraftGameTab, MatchDraftImageSize, MatchDraftLayout, MatchDraftRow, MatchDraftSeriesFormat, MatchDraftState, OpenDraftLobbyHandle } from "@/lib/match-draft/types";

const sideClass: Record<DraftSide, string> = {
  blue: "border-cyan/50 bg-cyan/10 text-cyan",
  red: "border-coral/50 bg-coral/10 text-coral",
};

// `grid` sizes the champion pool; `slot` is the pick rows' height (the art
// crop scales with it); `ban` is a FIXED tile size — bans stay compact
// instead of stretching to fill the column.
const imageSizes: { value: MatchDraftImageSize; label: string; grid: string; slot: string; ban: string; name: string }[] = [
  { value: "xs", label: "XS", grid: "grid-cols-[repeat(6,minmax(0,1fr))] sm:grid-cols-[repeat(8,minmax(0,1fr))] lg:grid-cols-[repeat(12,minmax(0,1fr))] xl:grid-cols-[repeat(16,minmax(0,1fr))]", slot: "min-h-20", ban: "h-10 w-10", name: "text-[10px]" },
  { value: "sm", label: "SM", grid: "grid-cols-[repeat(5,minmax(0,1fr))] sm:grid-cols-[repeat(7,minmax(0,1fr))] lg:grid-cols-[repeat(10,minmax(0,1fr))] xl:grid-cols-[repeat(14,minmax(0,1fr))]", slot: "min-h-24", ban: "h-12 w-12", name: "text-[11px]" },
  { value: "md", label: "MD", grid: "grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-12", slot: "min-h-28", ban: "h-14 w-14", name: "text-xs" },
  { value: "lg", label: "LG", grid: "grid-cols-3 sm:grid-cols-5 lg:grid-cols-[repeat(7,minmax(0,1fr))] xl:grid-cols-10", slot: "min-h-32", ban: "h-16 w-16", name: "text-sm" },
];

const sizeByValue = Object.fromEntries(imageSizes.map((size) => [size.value, size])) as Record<MatchDraftImageSize, (typeof imageSizes)[number]>;

/** Copies a shareable drafter URL (built from the page's own origin, so it
 *  works on any deploy) with per-button "Copied" feedback. */
function CopyLinkButton({ label, path }: { label: string; path: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(`${window.location.origin}${path}`).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-steel transition hover:border-coral hover:text-coral"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

/** The current game's tourney code with a copy button — rendered in the
 *  draft-complete banner so captains go straight from draft to lobby. */
function TourneyCodeChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="flex items-center gap-2 rounded border border-line/60 bg-navy/60 px-2.5 py-1.5">
      <code className="font-mono text-sm text-white">{code}</code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="rounded-full border border-line bg-panel px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-steel transition hover:border-coral hover:text-coral"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

function TeamMark({
  team,
  side,
  online,
}: {
  team: MatchDraftState["blueTeam"];
  side: DraftSide;
  /** Captain presence dot; undefined hides it (preview mode). */
  online?: boolean;
}) {
  return (
    <div className={`relative flex items-center gap-3 rounded border px-3 py-2 ${sideClass[side]}`}>
      {online !== undefined ? (
        <span
          title={online ? "Captain connected" : "Captain not connected"}
          aria-label={`${team.abbreviation} captain ${online ? "connected" : "not connected"}`}
          className={`absolute right-2 top-2 h-2 w-2 rounded-full ${online ? "bg-mint shadow-[0_0_6px_rgb(46_230_168/0.8)]" : "bg-line"}`}
        />
      ) : null}
      {team.imageUrl ? (
        // Team image URLs come from admin-entered Supabase Storage/public URLs.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.imageUrl} alt="" className="h-10 w-10 rounded object-contain" />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded bg-panel font-display text-sm font-bold not-italic">
          {team.abbreviation.slice(0, 2)}
        </span>
      )}
      <div className="min-w-0">
        <p className="font-display text-xl font-bold not-italic">{team.abbreviation}</p>
        <p className="truncate text-xs text-steel">{team.name}</p>
      </div>
    </div>
  );
}

function DraftSlot({
  side,
  kind,
  slot,
  action,
  active,
  playerName,
  imageSize,
  resolve,
  intent = null,
  onRequestChange = null,
  label,
}: {
  side: DraftSide;
  kind: DraftActionKind;
  slot: number;
  action: MatchDraftAction | null;
  active: boolean;
  playerName: string;
  imageSize: MatchDraftImageSize;
  resolve: (name: string) => MatchDraftChampion | null;
  /** Ghost champion the acting side is hovering (not yet locked). */
  intent?: string | null;
  onRequestChange?: (() => void) | null;
  /** Overrides the "pick N" header — role names once roles are confirmed. */
  label?: string;
}) {
  const champion = action?.champion ? resolve(action.champion) : null;
  const ghost = !action && intent ? resolve(intent) : null;
  const size = sizeByValue[imageSize];
  // "Centered" splash art is Riot's horizontal crop with the champion centered,
  // so it can bleed across the full slot width. Portrait loading art in a wide
  // slot ends up as a narrow strip hugging one edge.
  const art = champion ?? ghost;
  const portraitUrl = art ? art.splashUrl.replace("/champion/splash/", "/champion/centered/") : null;
  return (
    <div
      className={`relative overflow-hidden border px-2 py-2 ${size.slot} ${
        active ? "border-gold bg-gold/10" : action ? "border-line bg-navy/70" : "border-dashed border-line bg-panel/70"
      }`}
    >
      {portraitUrl ? (
        <>
          {/* Riot Data Dragon centered splash art is served from a fixed CDN URL.
              The art fills the whole slot; a short wide slot crops it vertically,
              so bias the window toward the top of the image (object-[center_20%])
              to keep the champion's head in frame instead of a torso strip. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={portraitUrl}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover object-[center_20%] ${champion ? "" : "opacity-40"}`}
          />
          {/* Left-edge scrim keeps the slot label and names readable over the art. */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/25 to-transparent" />
        </>
      ) : null}
      <div className="relative flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wide text-steel [text-shadow:0_1px_2px_rgb(0_0_0/0.85)]">
        <span>{label ?? `${kind} ${slot}`}</span>
        <span className="flex items-center gap-1.5">
          {onRequestChange ? (
            <button
              type="button"
              title="Request a change to this step"
              aria-label={`Request change to ${side} ${kind} ${slot}`}
              onClick={onRequestChange}
              className="rounded border border-line px-1 leading-tight text-steel transition hover:border-coral hover:text-coral"
            >
              ↺
            </button>
          ) : null}
          {side}
        </span>
      </div>
      <p className={`relative truncate font-display font-semibold not-italic [text-shadow:0_1px_2px_rgb(0_0_0/0.85)] ${action?.skipped ? "text-red-400/80" : ghost ? "text-steel" : "text-white"} ${imageSize === "xs" || imageSize === "sm" ? "mt-3 text-sm" : "mt-4 text-base"}`}>
        {action ? (action.champion ?? "Skipped") : ghost ? `${ghost.name}?` : "Open"}
      </p>
      {kind === "pick" && (action?.playerName || playerName) ? (
        <p className="relative mt-1 truncate text-xs text-steel [text-shadow:0_1px_2px_rgb(0_0_0/0.85)]">{action?.playerName || playerName}</p>
      ) : null}
    </div>
  );
}

const ROLE_LABELS = ["Top", "Jungle", "Mid", "ADC", "Support"] as const;

function SlotColumn({
  side,
  actions,
  currentStepIndex,
  players,
  imageSize,
  resolve,
  intentFor,
  requestChangeFor,
  positions = null,
}: {
  side: DraftSide;
  actions: MatchDraftAction[];
  currentStepIndex: number;
  players: string[];
  imageSize: MatchDraftImageSize;
  resolve: (name: string) => MatchDraftChampion | null;
  intentFor?: (stepIndex: number) => string | null;
  requestChangeFor?: (stepIndex: number) => (() => void) | null;
  /** Confirmed role order (top→support). When set, the column re-orders to
   *  roles instead of draft order. */
  positions?: (string | null)[] | null;
}) {
  if (positions && positions.length === ROLE_LABELS.length) {
    return (
      <div className="grid gap-2">
        {positions.map((champion, index) => {
          const action = champion
            ? actions.find(
                (entry) => entry.kind === "pick" && entry.side === side && entry.champion === champion,
              ) ?? null
            : null;
          return (
            <DraftSlot
              key={`${side}-role-${index}`}
              side={side}
              kind="pick"
              slot={index + 1}
              label={ROLE_LABELS[index]}
              // The drafted playerName reflects pick order, not roles — the
              // roster (already top→support) names the row instead.
              action={action ? { ...action, playerName: null } : null}
              active={false}
              playerName={players[index] ?? ""}
              imageSize={imageSize}
              resolve={resolve}
              onRequestChange={action?.stepIndex !== undefined ? requestChangeFor?.(action.stepIndex) ?? null : null}
            />
          );
        })}
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      {LCS_DRAFT_STEPS.filter((step) => step.side === side && step.kind === "pick").map((step) => (
        <DraftSlot
          key={`${step.side}-${step.kind}-${step.slot}`}
          side={step.side}
          kind={step.kind}
          slot={step.slot}
          action={actionForStep(actions, step)}
          active={step.index === currentStepIndex}
          playerName={players[step.slot - 1] ?? ""}
          imageSize={imageSize}
          resolve={resolve}
          intent={intentFor?.(step.index) ?? null}
          onRequestChange={requestChangeFor?.(step.index) ?? null}
        />
      ))}
    </div>
  );
}

function BanTile({
  step,
  action,
  active,
  resolve,
  imageSize,
  onRequestChange = null,
}: {
  step: (typeof LCS_DRAFT_STEPS)[number];
  action: MatchDraftAction | null;
  active: boolean;
  resolve: (name: string) => MatchDraftChampion | null;
  imageSize: MatchDraftImageSize;
  onRequestChange?: (() => void) | null;
}) {
  const champion = action?.champion ? resolve(action.champion) : null;
  return (
    <div
      data-testid={`ban-${step.side}-${step.slot}`}
      title={action ? (action.champion ?? "Skipped") : `Ban ${step.slot}`}
      className={`relative ${sizeByValue[imageSize].ban} shrink-0 overflow-hidden rounded border ${
        active ? "border-gold bg-gold/10" : action ? "border-line bg-navy/70" : "border-dashed border-line bg-panel/70"
      }`}
    >
      {champion ? (
        <>
          {/* Riot Data Dragon square icon — banned champs render grayscale with a strike. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={champion.iconUrl} alt={champion.name} className="h-full w-full object-cover grayscale-[45%]" loading="lazy" />
          <span aria-hidden className="absolute left-1/2 top-1/2 h-[145%] w-[3px] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-red-500/80" />
          <span className="absolute inset-x-0 bottom-0 truncate bg-black/80 px-0.5 text-center text-[8px] font-semibold leading-tight text-white">
            {champion.name}
          </span>
        </>
      ) : action?.skipped ? (
        <span className="flex h-full items-center justify-center font-mono text-[10px] font-semibold uppercase text-red-400/80">Skip</span>
      ) : (
        <span className="flex h-full items-center justify-center font-mono text-xs font-semibold text-steel">B{step.slot}</span>
      )}
      {onRequestChange ? (
        <button
          type="button"
          title="Request a change to this ban"
          aria-label={`Request change to ${step.side} ban ${step.slot}`}
          onClick={onRequestChange}
          className="absolute right-0.5 top-0.5 rounded border border-line bg-navy/80 px-1 text-[10px] leading-tight text-steel transition hover:border-coral hover:text-coral"
        >
          ↺
        </button>
      ) : null}
    </div>
  );
}

function BanRow({
  side,
  actions,
  currentStepIndex,
  resolve,
  imageSize,
  requestChangeFor,
}: {
  side: DraftSide;
  actions: MatchDraftAction[];
  currentStepIndex: number;
  resolve: (name: string) => MatchDraftChampion | null;
  imageSize: MatchDraftImageSize;
  requestChangeFor?: (stepIndex: number) => (() => void) | null;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${side === "red" ? "justify-end" : ""}`}>
      <p className="w-full text-[10px] font-bold uppercase tracking-[0.16em] text-steel">Bans</p>
      {LCS_DRAFT_STEPS.filter((step) => step.side === side && step.kind === "ban").map((step) => (
        <BanTile
          key={`${step.side}-ban-${step.slot}`}
          step={step}
          action={actionForStep(actions, step)}
          active={step.index === currentStepIndex}
          resolve={resolve}
          imageSize={imageSize}
          onRequestChange={requestChangeFor?.(step.index) ?? null}
        />
      ))}
    </div>
  );
}

/** Short sine ping for "it's your turn". Best-effort: browsers may refuse
 *  audio before any user gesture, and that's fine. */
function playTurnPing() {
  try {
    const AudioCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    const ctx = new AudioCtor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => void ctx.close();
  } catch {
    // audio is polish, never an error
  }
}

/** Blink the tab title a few times so an alt-tabbed captain notices. */
function flashTitle() {
  if (typeof document === "undefined") return;
  const original = document.title;
  let on = false;
  let count = 0;
  const interval = setInterval(() => {
    on = !on;
    count += 1;
    document.title = on ? "🔔 Your turn to draft!" : original;
    if (count >= 8 || document.hasFocus()) {
      clearInterval(interval);
      document.title = original;
    }
  }, 900);
}

/** Supabase/Postgrest errors are plain objects, not Error instances — pull a
 *  human message out of whatever was thrown, and translate the RLS rejection
 *  every non-captain visitor hits into plain language. */
function saveErrorMessage(err: unknown, fallback: string): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof (err as { message?: unknown })?.message === "string"
        ? (err as { message: string }).message
        : "";
  if (!raw) return fallback;
  if (/row-level security|permission denied|violates row-level/i.test(raw)) {
    return "You don't have permission to draft this match — sign in as one of this fixture's captains or an admin.";
  }
  if (/JWT|token|not authenticated/i.test(raw)) {
    return "You're not signed in — log in as a captain or admin to draft.";
  }
  // RPC validation errors read "CODE: human message" — show just the message.
  if (/^[A-Z_]+:\s/.test(raw)) return raw.replace(/^[A-Z_]+:\s*/, "");
  return `${fallback} (${raw})`;
}

const BEST_OF_OPTIONS: MatchDraftBestOf[] = [1, 3, 5];

const ROLE_FILTERS: { value: ChampionRole; label: string }[] = [
  { value: "top", label: "Top" },
  { value: "jungle", label: "Jungle" },
  { value: "mid", label: "Mid" },
  { value: "adc", label: "ADC" },
  { value: "support", label: "Support" },
];

/** Seconds left on the current turn, ticking once a second. Returns null
 *  until the clock should be shown (no turn start yet). Display only — the
 *  drafter does not auto-skip when it reaches zero. */
function useTurnCountdown(turnStartedAt: string | null, running: boolean): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  if (!running || !turnStartedAt) return null;
  const elapsed = Math.floor((now - new Date(turnStartedAt).getTime()) / 1000);
  return Math.max(0, DRAFT_TURN_SECONDS - Math.max(0, elapsed));
}

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
  tourneyCodes = {},
  reportHref = null,
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
  /** Fixture drafts: this fixture's tourney codes by game number. The page
   *  fetches them under RLS, so only the two teams' captains (and admins)
   *  ever receive any — spectators get an empty object. */
  tourneyCodes?: Record<number, string>;
  /** Fixture drafts: where "Report this result" points once the series is
   *  decided — the fixture's league's captain page. */
  reportHref?: string | null;
  onSave?: (state: MatchDraftState) => void | Promise<void>;
}) {
  const supabase = useMemo(() => (onSave ? null : createClient()), [onSave]);
  // One entry per game so the tabs switch instantly without a navigation.
  const [statesByGame, setStatesByGame] = useState<Record<number, MatchDraftState>>(() =>
    Object.fromEntries((initialStates?.length ? initialStates : [initialState]).map((game) => [game.gameNumber, game])),
  );
  const [gameNumber, setGameNumber] = useState(initialState.gameNumber);
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
  const state = statesByGame[followedGame ?? gameNumber] ?? initialState;
  const setState = (next: MatchDraftState) =>
    setStatesByGame((current) => ({ ...current, [next.gameNumber]: next }));
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<ChampionRole | null>(null);
  // Two-step drafting: clicking a champion only SELECTS it (broadcast to the
  // room as a ghost); the Lock In button confirms. pendingPick is the
  // viewer's own selection, remoteIntents are the other clients', per game.
  const [pendingPick, setPendingPick] = useState<{ stepIndex: number; champion: string } | null>(null);
  // Post-draft role confirmation: which side's order is being edited, and
  // the working top→support arrangement.
  const [roleEditor, setRoleEditor] = useState<{ gameNumber: number; side: DraftSide; order: (string | null)[] } | null>(null);
  const [onlineTeams, setOnlineTeams] = useState<Set<string>>(new Set());
  const [remoteIntents, setRemoteIntents] = useState<Record<number, { stepIndex: number; champion: string | null }>>({});
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [imageSizeIndex, setImageSizeIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentStep = LCS_DRAFT_STEPS[state.currentStepIndex] ?? LCS_DRAFT_STEPS[LCS_DRAFT_STEPS.length - 1];
  const currentAction = currentStep ? actionForStep(state.actions, currentStep) : null;
  const resolveChampion = useMemo(() => championLookup(champions), [champions]);
  const filteredChampions = champions.filter(
    (champion) =>
      champion.name.toLowerCase().includes(query.trim().toLowerCase()) &&
      (!roleFilter || champion.roles.includes(roleFilter)),
  );
  const imageSize = imageSizes[imageSizeIndex].value;
  const blockedChampions = useMemo(() => {
    if (!seriesFormat.fearless) return state.blockedChampions.length ? state.blockedChampions : [];
    const priorPicks = Object.values(statesByGame)
      .filter((game) => game.gameNumber < gameNumber)
      .flatMap((game) =>
        game.actions
          .filter((action) => action.kind === "pick")
          .map((action) => action.champion)
          .filter((champion): champion is string => Boolean(champion)),
      );
    return [...new Set([...state.blockedChampions, ...priorPicks])];
  }, [seriesFormat.fearless, state.blockedChampions, statesByGame, gameNumber]);
  const sameTeam = (a: string | null | undefined, b: string | null | undefined) =>
    Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
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
  const secondsLeft = useTurnCountdown(state.turnStartedAt, clockRunning);

  // Live sync: both captains (and spectators) see picks, readiness, side
  // swaps, and resets as they happen — for EVERY game in the series, so
  // switching tabs always shows current data. Team identity changes and row
  // deletes need server-resolved data (rosters), so those reload.
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel(`${lobby ? "open-draft" : "match-draft"}-${initialState.fixtureId}`)
      .on("presence", { event: "sync" }, () => {
        const present = new Set<string>();
        for (const entries of Object.values(channel.presenceState<{ team?: string }>())) {
          for (const entry of entries) {
            if (entry.team) present.add(entry.team);
          }
        }
        setOnlineTeams(present);
      })
      .on("broadcast", { event: "draft-intent" }, ({ payload }) => {
        const intent = payload as { gameNumber: number; stepIndex: number; champion: string | null };
        setRemoteIntents((current) => ({ ...current, [intent.gameNumber]: intent }));
      })
      .on(
        "postgres_changes",
        lobby
          ? { event: "*", schema: "public", table: "open_drafts", filter: `lobby_id=eq.${lobby.lobbyId}` }
          : { event: "*", schema: "public", table: "match_drafts", filter: `fixture_id=eq.${initialState.fixtureId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            window.location.reload();
            return;
          }
          const row = payload.new as MatchDraftRow;
          setStatesByGame((current) => {
            const game = current[row.game_number];
            if (!game) return current;
            if (
              (row.blue_team_name && row.blue_team_name !== game.blueTeam.name) ||
              (row.red_team_name && row.red_team_name !== game.redTeam.name)
            ) {
              window.location.reload();
              return current;
            }
            const actions = (row.actions ?? []).filter((action) => Boolean(action && (action.champion || action.skipped)));
            return {
              ...current,
              [row.game_number]: {
                ...game,
                status: row.status,
                currentStepIndex: row.current_step_index,
                turnStartedAt: row.turn_started_at,
                blueReady: row.blue_ready ?? false,
                redReady: row.red_ready ?? false,
                changeRequest: row.change_request ?? null,
                positions: row.positions ?? null,
                winnerTeam: row.winner_team ?? null,
                actions,
                canChooseSides: game.gameNumber > 1 && actions.length === 0,
              },
            };
          });
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel.track({ team: viewerTeamName?.trim().toLowerCase() ?? "spectator" });
        }
      });
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [supabase, initialState.fixtureId, viewerTeamName, lobby]);

  const setLayout = (layout: MatchDraftLayout) => setState({ ...state, layout });
  const captainOnline = (side: DraftSide): boolean | undefined =>
    onSave ? undefined : onlineTeams.has(teamForSide(side).name.trim().toLowerCase());
  const teamForSide = (side: DraftSide) => (side === "blue" ? state.blueTeam : state.redTeam);
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
      turn_started_at: new Date().toISOString(),
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
  const activePendingPick = pendingPick && pendingPick.stepIndex === state.currentStepIndex ? pendingPick : null;

  /** Fixture drafts call the match_draft_* RPCs keyed by fixture; public
   *  lobbies call their token-checked open_draft_* twins (same names with
   *  "match_draft" swapped for "open_draft", p_token instead of p_fixture). */
  const draftRpc = (client: NonNullable<typeof supabase>, name: string, params: Record<string, unknown>) =>
    lobby
      ? client.rpc(name.replace("match_draft", "open_draft"), { p_token: lobby.token, ...params })
      : client.rpc(name, { p_fixture: state.fixtureId, ...params });

  const sendIntent = (champion: string | null) => {
    void channelRef.current?.send({
      type: "broadcast",
      event: "draft-intent",
      payload: { gameNumber: state.gameNumber, stepIndex: state.currentStepIndex, champion },
    });
  };

  /** Step one of drafting: select a champion as your intent (ghosted for the
   *  whole room); Lock In confirms it. */
  const chooseChampion = (champion: string) => {
    if (!currentStep || state.status === "complete" || !mayActFor(currentStep.side)) return;
    setPendingPick({ stepIndex: currentStep.index, champion });
    sendIntent(champion);
  };

  const lockIn = async () => {
    if (!activePendingPick || activePendingPick.stepIndex !== currentStep?.index) return;
    await selectChampion(activePendingPick.champion);
    setPendingPick(null);
    sendIntent(null);
  };

  const intentFor = (stepIndex: number): string | null => {
    if (state.status === "complete" || stepIndex !== state.currentStepIndex) return null;
    if (activePendingPick?.stepIndex === stepIndex) return activePendingPick.champion;
    const remote = remoteIntents[state.gameNumber];
    return remote && remote.stepIndex === stepIndex ? remote.champion : null;
  };

  const selectChampion = async (champion: string) => {
    // A completed draft is locked — the final pick must not be replaceable.
    if (state.status === "complete") return;
    const started = state.actions.length > 0;
    const ready = state.blueReady && state.redReady;
    if (!started && !ready) return;
    if (!currentStep || state.sideChoiceRequired || isChampionUnavailable(champion, state.actions, blockedChampions)) return;
    if (!mayActFor(currentStep.side)) return;
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
    const next: MatchDraftState = {
      ...state,
      currentStepIndex: nextStepIndex ?? LCS_DRAFT_STEPS.length - 1,
      status: nextStepIndex === null ? "complete" : "drafting",
      turnStartedAt: new Date().toISOString(),
      actions: appended,
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
      setState(next);
    } catch (err) {
      setError(saveErrorMessage(err, "Draft could not be saved."));
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
      setState(next);
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
    if (next.blueReady && next.redReady) next.turnStartedAt = new Date().toISOString();
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
      setState(next);
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
      setState({ ...state, changeRequest: { stepIndex, side: action.side, champion: action.champion } });
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
      if (approve) {
        const remaining = state.actions.filter((entry) => entry.stepIndex !== state.changeRequest?.stepIndex);
        const nextStep = nextEmptyStepIndex(remaining);
        setState({
          ...state,
          actions: remaining,
          currentStepIndex: nextStep ?? LCS_DRAFT_STEPS.length - 1,
          status: "drafting",
          turnStartedAt: new Date().toISOString(),
          changeRequest: null,
          positions: null,
        });
      } else {
        setState({ ...state, changeRequest: null });
      }
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
      setState({ ...state, winnerTeam: next });
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
  const winsNeeded = Math.floor(seriesFormat.bestOf / 2) + 1;
  const seriesWinner =
    winsA >= winsNeeded ? state.scheduledTeams[0] : winsB >= winsNeeded ? state.scheduledTeams[1] : null;

  /** The side's five picks in the order they were drafted (nulls = skips) —
   *  the starting arrangement for role confirmation. */
  const picksInDraftOrder = (side: DraftSide): (string | null)[] =>
    LCS_DRAFT_STEPS.filter((step) => step.side === side && step.kind === "pick").map(
      (step) => actionForStep(state.actions, step)?.champion ?? null,
    );

  // An editor left open from another game's tab just stops applying.
  const activeRoleEditor = roleEditor && roleEditor.gameNumber === state.gameNumber ? roleEditor : null;

  const openRoleEditor = (side: DraftSide) =>
    setRoleEditor({
      gameNumber: state.gameNumber,
      side,
      order: state.positions?.[side] ?? picksInDraftOrder(side),
    });

  /** Move the entry at `from` to position `to` (others shift, drag-style). */
  const moveRoleTo = (from: number, to: number) =>
    setRoleEditor((current) => {
      if (!current || from === to || from < 0 || to < 0) return current;
      if (from >= current.order.length || to >= current.order.length) return current;
      const order = [...current.order];
      const [moved] = order.splice(from, 1);
      order.splice(to, 0, moved);
      return { ...current, order };
    });

  // Live drag state: the dragged item's CURRENT index (it moves as the
  // pointer crosses row midpoints, so the list re-orders under the finger).
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const roleListRef = useRef<HTMLUListElement | null>(null);
  const roleRowAtY = (clientY: number): number | null => {
    const list = roleListRef.current;
    if (!list) return null;
    const rows = Array.from(list.children) as HTMLElement[];
    for (let i = 0; i < rows.length; i += 1) {
      const rect = rows[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return rows.length - 1;
  };

  const saveRoles = async () => {
    if (!supabase || !activeRoleEditor) return;
    setSaving(true);
    setError(null);
    try {
      const { error: rpcError } = await draftRpc(supabase, "set_match_draft_positions", {
        p_game: state.gameNumber,
        p_side: activeRoleEditor.side,
        p_champions: activeRoleEditor.order,
      });
      if (rpcError) throw rpcError;
      setState({
        ...state,
        positions: { ...(state.positions ?? {}), [activeRoleEditor.side]: activeRoleEditor.order },
      });
      setRoleEditor(null);
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
      // Realtime brings the corrected row; recompute optimistically too.
      const last = Math.max(...state.actions.map((entry) => entry.stepIndex ?? -1));
      if (last >= 0) {
        const remaining = state.actions.filter((entry) => entry.stepIndex !== last);
        const nextStep = nextEmptyStepIndex(remaining);
        setState({
          ...state,
          actions: remaining,
          currentStepIndex: nextStep ?? LCS_DRAFT_STEPS.length - 1,
          status: "drafting",
          turnStartedAt: new Date().toISOString(),
          changeRequest: null,
          positions: null,
        });
      }
    } catch (err) {
      setError(saveErrorMessage(err, "Undo failed."));
    } finally {
      setSaving(false);
    }
  };

  // Expired clock: after a 3s grace, any involved client (captain/admin)
  // asks the server to skip the step. The server re-checks the elapsed time,
  // so an early call is safely rejected; the ref stops repeat attempts.
  const skipAttempted = useRef<string | null>(null);
  useEffect(() => {
    if (!supabase || onSave) return;
    if (!clockRunning || secondsLeft === null || secondsLeft > 0) return;
    if (!(canReset || viewerSide)) return;
    const key = `${state.gameNumber}:${state.currentStepIndex}`;
    if (skipAttempted.current === key) return;
    const timer = setTimeout(() => {
      skipAttempted.current = key;
      void draftRpc(supabase, "skip_match_draft_step", { p_game: state.gameNumber });
    }, 3000);
    return () => clearTimeout(timer);
    // draftRpc is stable in everything this effect already tracks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, onSave, clockRunning, secondsLeft, canReset, viewerSide, lobby, state.fixtureId, state.gameNumber, state.currentStepIndex]);

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

  const stepLabel = (stepIndex: number) => {
    const step = LCS_DRAFT_STEPS[stepIndex];
    return step ? `${step.side} ${step.kind} ${step.slot}` : `step ${stepIndex + 1}`;
  };

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
    const next = { ...seriesFormat, ...change };
    setSaving(true);
    setError(null);
    try {
      const { error: saveError } = await supabase.from("match_draft_settings").upsert(
        { fixture_id: state.fixtureId, best_of: next.bestOf, fearless: next.fearless },
        { onConflict: "fixture_id" },
      );
      if (saveError) throw saveError;
      // Tab count and fearless blocks are server-derived — rebuild the page.
      window.location.reload();
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
        let query = supabase.from("match_drafts").delete().eq("fixture_id", state.fixtureId);
        if (scope === "game") query = query.eq("game_number", state.gameNumber);
        const { error: deleteError } = await query;
        if (deleteError) throw deleteError;
      }
      // Rebuild everything (fearless blocks included) from the server.
      window.location.reload();
    } catch (err) {
      setError(saveErrorMessage(err, "Draft could not be reset."));
      setSaving(false);
    }
  };

  const switchGame = (game: MatchDraftGameTab) => {
    if (!statesByGame[game.gameNumber]) return;
    setGameNumber(game.gameNumber);
    // Keep the URL shareable/refreshable without a navigation.
    window.history.replaceState(null, "", game.href);
  };

  const gameTabs = games.length > 1 ? (
    <nav aria-label="Series games" className="flex flex-wrap items-center gap-1.5">
      {games.map((game) => {
        const active = game.gameNumber === state.gameNumber;
        // Live status from the client store (falls back to the server prop).
        const liveGame = statesByGame[game.gameNumber];
        const status = liveGame ? (liveGame.actions.length === 0 ? null : liveGame.status) : game.status;
        return (
          <button
            key={game.gameNumber}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => switchGame(game)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
              active ? "bg-coral text-navy" : "border border-line bg-panel text-steel hover:text-white"
            }`}
          >
            Game {game.gameNumber}
            {status === "complete" ? <span aria-label="complete" className={active ? "text-navy" : "text-mint"}>✓</span> : null}
            {status === "drafting" ? <span aria-label="in progress" className={active ? "text-navy" : "text-gold"}>●</span> : null}
          </button>
        );
      })}
    </nav>
  ) : null;

  // Pops up where the action is: pinned to the bottom of the viewport the
  // moment a champion is selected, so confirming never means scrolling back
  // to the header.
  const pendingChampion = activePendingPick ? resolveChampion(activePendingPick.champion) : null;
  const lockInBar = activePendingPick ? (
    <div className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4" role="dialog" aria-label="Confirm pick">
      <div className="flex items-center gap-3 rounded-full border border-coral/60 bg-navy/95 py-2 pl-2 pr-2 shadow-[0_8px_32px_rgb(0_0_0/0.6)] backdrop-blur">
        {pendingChampion ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pendingChampion.iconUrl} alt="" className="h-10 w-10 rounded-full border border-line object-cover" />
        ) : null}
        <div className="min-w-0">
          <p className="font-display text-sm font-bold not-italic text-white">{activePendingPick.champion}</p>
          <p className="text-[10px] uppercase tracking-wide text-steel">
            {currentStep?.side} {currentStep?.kind} {currentStep?.slot}
          </p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            setPendingPick(null);
            sendIntent(null);
          }}
          className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-steel transition hover:text-white disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void lockIn()}
          className="btn-coral px-4 py-1.5 text-xs disabled:opacity-40"
        >
          Lock in {activePendingPick.champion}
        </button>
      </div>
    </div>
  ) : null;

  // The code for the game being viewed — captains-only by construction
  // (spectators receive an empty tourneyCodes object; see the prop doc).
  const currentTourneyCode = tourneyCodes[state.gameNumber] ?? null;

  const completeBanner = state.status === "complete" ? (
    <section className="card-brand flex flex-wrap items-center gap-3 border-mint/40 p-3" aria-label="Draft complete">
      <span className="rounded-full border border-mint/50 bg-mint/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-mint">
        Draft complete
      </span>
      <span className="text-sm text-steel">
        All picks and bans are locked in.
        {currentTourneyCode
          ? " Create the custom lobby with this game's tourney code:"
          : games.length > 1
            ? " Use the game tabs to move to the next game."
            : ""}
      </span>
      {currentTourneyCode ? <TourneyCodeChip code={currentTourneyCode} /> : null}
    </section>
  ) : null;

  // Either captain (or an admin, on fixture drafts) records who won the
  // finished game; the tally calls the series at the majority.
  const winnerPicker = !onSave && state.status === "complete" ? (
    <section className="card-brand flex flex-wrap items-center gap-3 p-3" aria-label="Game result">
      <span className="label-dash">Game {state.gameNumber} result</span>
      {state.scheduledTeams.map((team) => {
        const won = sameTeam(state.winnerTeam, team.name);
        return (
          <button
            key={team.name}
            type="button"
            disabled={saving || !(viewerSide || canReset)}
            aria-pressed={won}
            onClick={() => void setWinner(team.name)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition disabled:opacity-40 ${
              won ? "border border-mint/60 bg-mint/15 text-mint" : "border border-line bg-panel text-steel hover:text-white"
            }`}
          >
            {team.abbreviation} won{won ? " ✓" : ""}
          </button>
        );
      })}
      <span className={`text-sm ${seriesWinner ? "font-semibold text-mint" : "text-steel"}`}>
        {seriesWinner
          ? `${seriesWinner.abbreviation} takes the series ${Math.max(winsA, winsB)}–${Math.min(winsA, winsB)}!`
          : viewerSide || canReset
            ? "Either captain can record it — recorded results prefill your match report."
            : "Waiting on a captain to record the result."}
      </span>
      {/* Once the series is called, the shortest path to the paperwork. */}
      {!lobby && reportHref && seriesWinner ? (
        <a
          href={reportHref}
          className="ml-auto inline-flex rounded-full border border-coral/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-coral transition hover:bg-coral hover:text-navy"
        >
          Report this result →
        </a>
      ) : null}
    </section>
  ) : null;

  // After the game's draft locks, each team confirms which champion goes to
  // which role (drafterlol-style) — the pick columns then re-order to match.
  const roleConfirm = !onSave && state.status === "complete" ? (
    <section className="card-brand flex flex-col gap-3 p-3" aria-label="Role confirmation">
      <div className="flex flex-wrap items-center gap-3">
        <span className="label-dash">Role confirmation</span>
        <span className="text-sm text-steel">
          Captains rarely draft in position order — set which champion each role is actually playing.
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {(["blue", "red"] as DraftSide[]).map((side) => {
          const confirmed = state.positions?.[side] ?? null;
          const editable = canReset || viewerSide === side;
          const editing = activeRoleEditor?.side === side ? activeRoleEditor : null;
          const roster = playersForSide(side);
          return (
            <div key={side} className={`rounded border p-3 ${sideClass[side]}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wide">{teamForSide(side).abbreviation}</span>
                {editing ? null : confirmed ? (
                  <span className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-mint">Roles confirmed ✓</span>
                    {editable ? (
                      <button type="button" disabled={saving} onClick={() => openRoleEditor(side)} className="btn-pill px-2.5 py-1 text-[11px] disabled:opacity-40">
                        Adjust
                      </button>
                    ) : null}
                  </span>
                ) : editable ? (
                  <button type="button" disabled={saving} onClick={() => openRoleEditor(side)} className="btn-coral px-3 py-1 text-[11px] disabled:opacity-40">
                    Confirm roles
                  </button>
                ) : (
                  <span className="text-[11px] uppercase tracking-wide text-steel">
                    Waiting for {teamForSide(side).abbreviation}…
                  </span>
                )}
              </div>
              <ul ref={editing ? roleListRef : undefined} className="mt-2 grid gap-1">
                {(editing?.order ?? confirmed ?? picksInDraftOrder(side)).map((champion, index) => (
                  <li
                    key={`${side}-${index}`}
                    tabIndex={editing ? 0 : undefined}
                    aria-label={editing ? `Reorder ${champion ?? "skipped pick"} — drag, or press the arrow keys` : undefined}
                    onPointerDown={
                      editing
                        ? (event) => {
                            event.preventDefault();
                            event.currentTarget.setPointerCapture(event.pointerId);
                            setDragFrom(index);
                          }
                        : undefined
                    }
                    onPointerMove={
                      editing
                        ? (event) => {
                            if (dragFrom === null) return;
                            const target = roleRowAtY(event.clientY);
                            if (target !== null && target !== dragFrom) {
                              moveRoleTo(dragFrom, target);
                              setDragFrom(target);
                            }
                          }
                        : undefined
                    }
                    onPointerUp={editing ? () => setDragFrom(null) : undefined}
                    onPointerCancel={editing ? () => setDragFrom(null) : undefined}
                    onKeyDown={
                      editing
                        ? (event) => {
                            if (event.key === "ArrowUp") {
                              event.preventDefault();
                              moveRoleTo(index, index - 1);
                            } else if (event.key === "ArrowDown") {
                              event.preventDefault();
                              moveRoleTo(index, index + 1);
                            }
                          }
                        : undefined
                    }
                    className={`flex items-center gap-2 rounded bg-navy/60 px-2 py-1.5 text-sm text-white ${
                      editing
                        ? `cursor-grab touch-none select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-coral ${
                            dragFrom === index ? "cursor-grabbing shadow-[0_0_0_1px] shadow-coral" : ""
                          }`
                        : ""
                    }`}
                  >
                    {editing ? (
                      <span aria-hidden className="shrink-0 text-xs leading-none text-steel">
                        ⠿
                      </span>
                    ) : null}
                    <span className="w-14 shrink-0 text-[10px] font-bold uppercase tracking-wide text-steel">{ROLE_LABELS[index]}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {champion ?? <span className="font-normal text-red-400/80">Skipped</span>}
                    </span>
                    {roster[index] ? <span className="truncate text-xs text-steel">{roster[index]}</span> : null}
                  </li>
                ))}
              </ul>
              {editing ? (
                <p className="mt-1 text-[11px] text-steel">Drag each champion onto the role they&apos;ll play.</p>
              ) : null}
              {editing ? (
                <div className="mt-2 flex gap-2">
                  <button type="button" disabled={saving} onClick={() => void saveRoles()} className="btn-coral px-3 py-1.5 text-xs disabled:opacity-40">
                    Save roles
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setRoleEditor(null)}
                    className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-steel transition hover:text-white disabled:opacity-40"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  ) : null;

  const changeBanner = state.changeRequest ? (
    <section className="card-brand flex flex-wrap items-center gap-3 border-gold/40 p-3" aria-label="Change request">
      <span className="rounded-full border border-gold/50 bg-gold/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-gold">
        Change requested
      </span>
      <span className="text-sm text-steel">
        {teamForSide(state.changeRequest.side).abbreviation} wants to redo{" "}
        <span className="font-semibold uppercase text-white">{stepLabel(state.changeRequest.stepIndex)}</span>
        {state.changeRequest.champion ? ` (${state.changeRequest.champion})` : " (skipped)"}.
      </span>
      {!onSave && (canReset || (viewerSide && viewerSide !== state.changeRequest.side)) ? (
        <span className="flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void respondChange(true)}
            className="rounded-full border border-mint/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-mint transition hover:bg-mint/15 disabled:opacity-40"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void respondChange(false)}
            className="rounded-full border border-red-400/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-red-400 transition hover:bg-red-500/15 disabled:opacity-40"
          >
            Deny
          </button>
        </span>
      ) : !onSave && viewerSide === state.changeRequest.side ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => void respondChange(false)}
          className="rounded-full border border-line px-3 py-1 text-xs font-semibold uppercase tracking-wide text-steel transition hover:text-white disabled:opacity-40"
        >
          Withdraw
        </button>
      ) : (
        <span className="text-xs uppercase tracking-wide text-steel">Waiting for the other team…</span>
      )}
    </section>
  ) : null;

  const notReadyTeams = (["blue", "red"] as DraftSide[])
    .filter((side) => !(side === "blue" ? state.blueReady : state.redReady))
    .map((side) => teamForSide(side).abbreviation);
  const readyCheck = drafting && !draftStarted ? (
    <section className="card-brand flex flex-col items-center gap-4 border-gold/50 p-6 text-center" aria-label="Ready check">
      <span className="rounded-full border border-gold/50 bg-gold/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-gold">
        Ready check
      </span>
      <h2 className="type-display text-2xl text-white sm:text-3xl">
        {state.sideChoiceRequired
          ? "Choose sides first, then ready up"
          : bothReady
            ? "Both teams ready — the draft is live!"
            : "Both teams must ready up to start"}
      </h2>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {(["blue", "red"] as DraftSide[]).map((side) => {
          const isReady = side === "blue" ? state.blueReady : state.redReady;
          const canPress = !saving && !state.sideChoiceRequired && mayActFor(side);
          return (
            <button
              key={side}
              type="button"
              disabled={saving || state.sideChoiceRequired || !mayActFor(side)}
              aria-pressed={isReady}
              onClick={() => void toggleReady(side)}
              className={`rounded-full border-2 px-6 py-3 text-sm font-bold uppercase tracking-wide transition disabled:opacity-40 ${
                isReady
                  ? "border-mint/70 bg-mint/15 text-mint"
                  : `${sideClass[side]} ${canPress && !isReady ? "animate-pulse hover:brightness-125" : ""}`
              }`}
            >
              {teamForSide(side).abbreviation} {isReady ? "ready ✓" : "ready?"}
            </button>
          );
        })}
      </div>
      <span className="text-xs uppercase tracking-wide text-steel">
        {state.sideChoiceRequired
          ? "Pick which team takes blue side above."
          : bothReady
            ? "The clock is running — blue's first ban is up."
            : `Waiting on ${notReadyTeams.join(" and ")} — picks unlock once both teams check in.`}
      </span>
    </section>
  ) : null;

  const sideChooser = state.canChooseSides && state.actions.length === 0 ? (
    <section className="card-brand flex flex-wrap items-center gap-3 p-3" aria-label="Side selection">
      <span className="label-dash">{state.sideChoiceRequired ? "Choose sides to start" : "Choose sides"}</span>
      {state.scheduledTeams.map((team) => (
        <button
          key={team.name}
          type="button"
          disabled={saving}
          onClick={() => void chooseBlueTeam(team)}
          aria-pressed={state.blueTeam.name === team.name}
          className="btn-pill px-3 py-1.5 text-xs"
        >
          {team.name} blue side
        </button>
      ))}
    </section>
  ) : null;

  const championPool = (
    <section className="min-w-0 rounded border border-line bg-navy/60 p-3" aria-label="Champion pool">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-steel sm:max-w-xs">
          Search champions
          <input value={query} onChange={(e) => setQuery(e.target.value)} className="input-brand px-3 py-2 text-sm" />
        </label>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Role filter">
          <button
            type="button"
            aria-pressed={roleFilter === null}
            onClick={() => setRoleFilter(null)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
              roleFilter === null ? "bg-coral text-navy" : "border border-line bg-panel text-steel hover:text-white"
            }`}
          >
            All
          </button>
          {ROLE_FILTERS.map((role) => (
            <button
              key={role.value}
              type="button"
              aria-pressed={roleFilter === role.value}
              onClick={() => setRoleFilter((current) => (current === role.value ? null : role.value))}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
                roleFilter === role.value ? "bg-coral text-navy" : "border border-line bg-panel text-steel hover:text-white"
              }`}
            >
              {role.label}
            </button>
          ))}
        </div>
      </div>
      <div className={`mt-3 grid gap-2 ${sizeByValue[imageSize].grid}`} data-testid="champion-pool-grid" data-size={imageSize}>
        {filteredChampions.map((champion) => {
          const unavailable = isChampionUnavailable(champion.name, state.actions, blockedChampions);
          return (
            <button
              key={champion.id}
              type="button"
              disabled={unavailable || saving || state.sideChoiceRequired || state.status === "complete" || (!draftStarted && !bothReady) || !currentStep || !mayActFor(currentStep.side)}
              aria-pressed={activePendingPick?.champion === champion.name}
              onClick={() => chooseChampion(champion.name)}
              aria-label={`${champion.name}${unavailable ? " unavailable" : ""}`}
              className={`group relative aspect-square overflow-hidden border border-line bg-panel text-left font-semibold text-white hover:border-coral disabled:cursor-not-allowed disabled:opacity-35 ${sizeByValue[imageSize].name}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={champion.iconUrl} alt="" className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
              <span className="absolute inset-x-0 bottom-0 bg-black/75 px-2 py-1 text-xs">{champion.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );

  // The turn clock card — center column on stage, top strip on board.
  const timerCard = (
    <div className="flex min-w-32 flex-col items-center justify-center rounded border border-line bg-panel px-4 py-4 text-center">
      <span className="label-dash">Game {state.gameNumber}</span>
      <span className={`type-display mt-1 text-4xl ${secondsLeft !== null && secondsLeft <= 5 ? "animate-pulse text-red-400" : "text-white"}`}>
        {state.status === "complete" ? "Done" : secondsLeft !== null ? `${secondsLeft}s` : "—"}
      </span>
      <span className="mt-1 text-xs uppercase text-steel">
        {state.status === "complete"
          ? "draft complete"
          : clockRunning
            ? `${currentStep?.side} ${currentStep?.kind} ${currentStep?.slot}`
            : "waiting for ready check"}
      </span>
    </div>
  );

  const stage = (
    // Phones: the timer strip sits on top and the two team columns share a
    // row (halving the scroll to the champion pool); lg restores the
    // broadcast-style blue | clock | red arrangement.
    <section className="flex flex-col gap-4" aria-label="Stage draft layout">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-start">
        <div className="order-2 flex min-w-0 flex-col gap-3 lg:order-1">
          <TeamMark team={state.blueTeam} side="blue" online={captainOnline("blue")} />
          <SlotColumn side="blue" actions={state.actions} currentStepIndex={state.currentStepIndex} players={playersForSide("blue")} imageSize={imageSize} resolve={resolveChampion} intentFor={intentFor} requestChangeFor={requestChangeFor} positions={state.positions?.blue ?? null} />
          <BanRow side="blue" actions={state.actions} currentStepIndex={state.currentStepIndex} resolve={resolveChampion} imageSize={imageSize} requestChangeFor={requestChangeFor} />
        </div>
        <div className="order-1 col-span-2 lg:order-2 lg:col-span-1">{timerCard}</div>
        <div className="order-3 flex min-w-0 flex-col gap-3">
          <TeamMark team={state.redTeam} side="red" online={captainOnline("red")} />
          <SlotColumn side="red" actions={state.actions} currentStepIndex={state.currentStepIndex} players={playersForSide("red")} imageSize={imageSize} resolve={resolveChampion} intentFor={intentFor} requestChangeFor={requestChangeFor} positions={state.positions?.red ?? null} />
          <BanRow side="red" actions={state.actions} currentStepIndex={state.currentStepIndex} resolve={resolveChampion} imageSize={imageSize} requestChangeFor={requestChangeFor} />
        </div>
      </div>
      {championPool}
    </section>
  );

  const board = (
    // Below xl the sidebars pair up above a full-width pool instead of
    // stacking into one long column.
    <section className="flex flex-col gap-4" aria-label="Board draft layout">
      <div className="flex justify-center">{timerCard}</div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-[18rem_minmax(0,1fr)_18rem]">
      <aside className="order-1 flex min-w-0 flex-col gap-3">
        <TeamMark team={state.blueTeam} side="blue" online={captainOnline("blue")} />
        <SlotColumn side="blue" actions={state.actions} currentStepIndex={state.currentStepIndex} players={playersForSide("blue")} imageSize={imageSize} resolve={resolveChampion} intentFor={intentFor} requestChangeFor={requestChangeFor} positions={state.positions?.blue ?? null} />
        <BanRow side="blue" actions={state.actions} currentStepIndex={state.currentStepIndex} resolve={resolveChampion} imageSize={imageSize} requestChangeFor={requestChangeFor} />
      </aside>
      <div className="order-3 col-span-2 min-w-0 xl:order-2 xl:col-span-1">{championPool}</div>
      <aside className="order-2 flex min-w-0 flex-col gap-3 xl:order-3">
        <TeamMark team={state.redTeam} side="red" online={captainOnline("red")} />
        <SlotColumn side="red" actions={state.actions} currentStepIndex={state.currentStepIndex} players={playersForSide("red")} imageSize={imageSize} resolve={resolveChampion} intentFor={intentFor} requestChangeFor={requestChangeFor} positions={state.positions?.red ?? null} />
        <BanRow side="red" actions={state.actions} currentStepIndex={state.currentStepIndex} resolve={resolveChampion} imageSize={imageSize} requestChangeFor={requestChangeFor} />
      </aside>
      </div>
    </section>
  );

  if (overlay) {
    // OBS browser source: teams, picks, bans, and the clock — nothing else.
    return (
      <main className={`flex w-full flex-col gap-4 p-4 text-white ${overlayTransparent ? "bg-transparent" : "bg-navy"}`}>
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-start">
          <div className="flex flex-col gap-3">
            <TeamMark team={state.blueTeam} side="blue" online={captainOnline("blue")} />
            <SlotColumn side="blue" actions={state.actions} currentStepIndex={state.currentStepIndex} players={playersForSide("blue")} imageSize="lg" resolve={resolveChampion} positions={state.positions?.blue ?? null} />
            <BanRow side="blue" actions={state.actions} currentStepIndex={state.currentStepIndex} resolve={resolveChampion} imageSize="lg" />
          </div>
          <div className="flex min-w-32 flex-col items-center justify-center rounded border border-line bg-panel px-4 py-4 text-center">
            <span className="label-dash">Game {state.gameNumber}</span>
            <span className={`type-display mt-1 text-5xl ${secondsLeft !== null && secondsLeft <= 5 ? "animate-pulse text-red-400" : "text-white"}`}>
              {state.status === "complete" ? "Done" : secondsLeft !== null ? `${secondsLeft}s` : "—"}
            </span>
            <span className="mt-1 text-xs uppercase text-steel">
              {state.status === "complete"
                ? "draft complete"
                : clockRunning
                  ? `${currentStep?.side} ${currentStep?.kind} ${currentStep?.slot}`
                  : "waiting for ready check"}
            </span>
          </div>
          <div className="flex flex-col gap-3">
            <TeamMark team={state.redTeam} side="red" online={captainOnline("red")} />
            <SlotColumn side="red" actions={state.actions} currentStepIndex={state.currentStepIndex} players={playersForSide("red")} imageSize="lg" resolve={resolveChampion} positions={state.positions?.red ?? null} />
            <BanRow side="red" actions={state.actions} currentStepIndex={state.currentStepIndex} resolve={resolveChampion} imageSize="lg" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-4 bg-hash px-4 py-6 text-white">
      <header className="card-brand flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <span className="label-dash">
            Bo{seriesFormat.bestOf}{seriesFormat.fearless ? " fearless" : ""} · Game {state.gameNumber}
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

      {completeBanner}
      {winnerPicker}
      {roleConfirm}
      {changeBanner}
      {sideChooser}
      {readyCheck}

      <section className="card-brand flex flex-wrap items-end gap-3 p-3">
        {!onSave && !lobby ? (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Series format">
            <span className="label-dash">Format</span>
            {BEST_OF_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                disabled={saving}
                aria-pressed={seriesFormat.bestOf === option}
                onClick={() => (seriesFormat.bestOf === option ? undefined : void saveSeriesFormat({ bestOf: option }))}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition disabled:opacity-40 ${
                  seriesFormat.bestOf === option ? "bg-coral text-navy" : "border border-line bg-panel text-steel hover:text-white"
                }`}
              >
                Bo{option}
              </button>
            ))}
            <button
              type="button"
              disabled={saving}
              aria-pressed={seriesFormat.fearless}
              onClick={() => void saveSeriesFormat({ fearless: !seriesFormat.fearless })}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition disabled:opacity-40 ${
                seriesFormat.fearless ? "bg-mint/15 text-mint border border-mint/50" : "border border-line bg-panel text-steel hover:text-white"
              }`}
            >
              Fearless {seriesFormat.fearless ? "on" : "off"}
            </button>
          </div>
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="label-dash">Image size</span>
          <button
            type="button"
            aria-label="Decrease image size"
            disabled={imageSizeIndex === 0}
            onClick={() => setImageSizeIndex((current) => Math.max(0, current - 1))}
            className="btn-pill px-3 py-1.5 text-xs disabled:opacity-40"
          >
            -
          </button>
          <span className="min-w-8 text-center text-xs font-semibold text-white">{imageSizes[imageSizeIndex].label}</span>
          <button
            type="button"
            aria-label="Increase image size"
            disabled={imageSizeIndex === imageSizes.length - 1}
            onClick={() => setImageSizeIndex((current) => Math.min(imageSizes.length - 1, current + 1))}
            className="btn-pill px-3 py-1.5 text-xs disabled:opacity-40"
          >
            +
          </button>
        </div>
        {!onSave || viewerTeamName !== undefined ? (
          <span
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
              canReset ? "border-gold/50 text-gold" : viewerSide ? sideClass[viewerSide] : "border-line text-steel"
            }`}
          >
            {canReset ? "Admin — full control" : viewerSide ? `Drafting for ${teamForSide(viewerSide).abbreviation} (${viewerSide} side)` : "Spectating"}
          </span>
        ) : null}
        <p className="text-sm text-steel">
          Current turn: <span className="font-semibold uppercase text-white">{currentStep?.side} {currentStep?.kind} {currentStep?.slot}</span>
          {currentAction ? <span> · locked {currentAction.champion}</span> : null}
        </p>
        {error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}
      </section>

      {state.layout === "stage" ? stage : board}
      {lockInBar}
    </main>
  );
}

import type { KeyboardEventHandler, PointerEventHandler, ReactNode } from "react";
import { CHAMPIONS, championLookup, type MatchDraftChampion } from "@/lib/match-draft/champions";
import type { DraftSide, MatchDraftImageSize } from "@/lib/match-draft/types";
import type { DraftMatchupPickView, DraftMatchupSideView, DraftMatchupView } from "@/lib/match-draft/presentation";

const sideClass: Record<DraftSide, string> = {
  blue: "border-cyan/50 bg-cyan/10 text-cyan",
  red: "border-coral/50 bg-coral/10 text-coral",
};

const imageSizes: Record<MatchDraftImageSize, { slot: string; ban: string; name: string }> = {
  xs: { slot: "min-h-20", ban: "h-10 w-10", name: "text-[10px]" },
  sm: { slot: "min-h-24", ban: "h-12 w-12", name: "text-[11px]" },
  md: { slot: "min-h-28", ban: "h-14 w-14", name: "text-xs" },
  lg: { slot: "min-h-32", ban: "h-16 w-16", name: "text-sm" },
};

export interface DraftPickSlotProps {
  side: DraftSide;
  pick: DraftMatchupPickView;
  imageSize: MatchDraftImageSize;
  resolve?: (name: string) => MatchDraftChampion | null;
  active?: boolean;
  intent?: string | null;
  onRequestChange?: (() => void) | null;
  label?: string;
  slotClassName?: string;
  emptyLabel?: string;
  interactive?: boolean;
  role?: "listitem";
  ariaLabel?: string;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  onPointerMove?: PointerEventHandler<HTMLDivElement>;
  onPointerUp?: PointerEventHandler<HTMLDivElement>;
  onPointerCancel?: PointerEventHandler<HTMLDivElement>;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
}

const defaultResolve = championLookup(CHAMPIONS);

export function DraftPickSlot({
  side,
  pick,
  imageSize,
  resolve = defaultResolve,
  active = false,
  intent = null,
  onRequestChange = null,
  label,
  slotClassName = "",
  emptyLabel = "Open",
  interactive = false,
  role,
  ariaLabel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onKeyDown,
}: DraftPickSlotProps) {
  const champion = pick.champion ? resolve(pick.champion) : null;
  const ghost = pick.state === "missing" && intent ? resolve(intent) : null;
  const art = champion ?? ghost;
  const portraitUrl = art?.splashUrl.replace("/champion/splash/", "/champion/centered/") ?? null;
  const size = imageSizes[imageSize];
  const pickLabel = label ?? `${side === "blue" ? "B" : "R"}${pick.slot}`;
  const championLabel = champion?.name ?? pick.champion ?? (pick.state === "skipped" ? "Skipped" : ghost ? `${ghost.name}?` : emptyLabel);

  return (
    <div
      role={role}
      tabIndex={interactive ? 0 : undefined}
      aria-label={ariaLabel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
      data-testid={`${side}-pick-slot`}
      className={`relative overflow-hidden border px-2 py-2 ${size.slot} ${slotClassName} ${
        active ? "border-gold bg-gold/10" : pick.state === "recorded" ? "border-border-subtle bg-canvas/70" : "border-dashed border-border-subtle bg-surface/70"
      } ${interactive ? "cursor-grab touch-none select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus" : ""}`}
    >
      {portraitUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={portraitUrl}
            alt={champion?.name ?? ""}
            className={`absolute inset-0 h-full w-full object-cover object-[center_20%] ${champion ? "" : "opacity-40"}`}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/25 to-transparent" />
        </>
      ) : null}
      <div className="relative flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wide text-muted [text-shadow:0_1px_2px_rgb(0_0_0/0.85)]">
        {/* The pick number rides on the label line — it used to be a
            separate pill pinned to the corner, which sat on top of the
            role and hid it ("JUNGLE" read as "NGLE"). */}
        <span title={pick.pickNumber ? `Pick ${pick.pickNumber}` : undefined}>
          {pick.role ? pick.role : pickLabel}
          {pick.pickNumber ? ` · P${pick.pickNumber}` : ""}
        </span>
        {pick.role ? <span className="sr-only">{pick.role}</span> : null}
        <span className="flex items-center gap-1.5">
          {onRequestChange ? (
            <button
              type="button"
              title="Request a change to this step"
              aria-label={`Request change to ${side} pick ${pick.slot}`}
              onClick={onRequestChange}
              className="rounded border border-border-strong px-1 leading-tight text-muted transition hover:border-action-text hover:text-action-text"
            >
              ↺
            </button>
          ) : null}
          {side}
        </span>
      </div>
      <p className={`relative truncate font-display font-semibold not-italic [text-shadow:0_1px_2px_rgb(0_0_0/0.85)] ${pick.state === "skipped" ? "text-red-400/80" : ghost ? "text-muted" : "text-white"} ${imageSize === "xs" || imageSize === "sm" ? "mt-3 text-sm" : "mt-4 text-base"}`}>
        {championLabel}
      </p>
      {pick.playerName ? <p className="relative mt-1 truncate text-xs text-muted [text-shadow:0_1px_2px_rgb(0_0_0/0.85)]">{pick.playerName}</p> : null}
    </div>
  );
}

export function DraftTeamHeader({
  side,
  team,
  online,
}: {
  side: DraftSide;
  team: DraftMatchupSideView["team"];
  online?: boolean;
}) {
  return (
    <div className={`relative flex items-center gap-3 rounded border px-3 py-2 ${sideClass[side]} ${side === "red" ? "flex-row-reverse text-right" : ""}`}>
      {online !== undefined ? (
        <span
          title={online ? "Captain connected" : "Captain not connected"}
          aria-label={`${team.abbreviation} captain ${online ? "connected" : "not connected"}`}
          className={`absolute top-2 h-2 w-2 rounded-full ${side === "red" ? "left-2" : "right-2"} ${online ? "bg-mint shadow-[0_0_6px_rgb(46_230_168/0.8)]" : "bg-border-subtle"}`}
        />
      ) : null}
      {team.imageUrl ? (
        // Team image URLs come from admin-entered Supabase Storage/public URLs.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.imageUrl} alt="" className="h-10 w-10 rounded object-contain" />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded bg-surface font-display text-sm font-bold not-italic">
          {team.abbreviation.slice(0, 3)}
        </span>
      )}
      <div className="min-w-0">
        <p className="font-display text-xl font-bold not-italic">{team.abbreviation}</p>
        <p className="truncate text-xs text-muted">{team.name}</p>
      </div>
    </div>
  );
}

function BanTile({
  side,
  ban,
  imageSize,
  resolve,
  active,
  onRequestChange,
}: {
  side: DraftSide;
  ban: DraftMatchupSideView["bans"][number];
  imageSize: MatchDraftImageSize;
  resolve: (name: string) => MatchDraftChampion | null;
  active: boolean;
  onRequestChange?: (() => void) | null;
}) {
  const champion = ban.champion ? resolve(ban.champion) : null;
  return (
    <div
      data-testid={`ban-${side}-${ban.slot}`}
      title={ban.state === "skipped" ? "Skipped" : ban.champion ?? `Ban ${ban.slot}`}
      className={`relative ${imageSizes[imageSize].ban} shrink-0 overflow-hidden rounded border ${
        active ? "border-gold bg-gold/10" : ban.state === "recorded" ? "border-border-subtle bg-canvas/70" : "border-dashed border-border-subtle bg-surface/70"
      }`}
    >
      {champion ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={champion.iconUrl} alt={champion.name} className="h-full w-full object-cover grayscale-[45%]" loading="lazy" />
          <span aria-hidden className="absolute left-1/2 top-1/2 h-[145%] w-[3px] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-red-500/80" />
          <span className="absolute inset-x-0 bottom-0 truncate bg-black/80 px-0.5 text-center text-[8px] font-semibold leading-tight text-white">{champion.name}</span>
        </>
      ) : ban.state === "skipped" ? (
        <span className="flex h-full items-center justify-center font-mono text-[10px] font-semibold uppercase text-red-400/80">Skip</span>
      ) : (
        <span className="flex h-full items-center justify-center font-mono text-xs font-semibold text-muted">B{ban.slot}</span>
      )}
      {onRequestChange ? (
        <button
          type="button"
          title="Request a change to this ban"
          aria-label={`Request change to ${side} ban ${ban.slot}`}
          onClick={onRequestChange}
          className="absolute right-0.5 top-0.5 rounded border border-border-strong bg-canvas/80 px-1 text-[10px] leading-tight text-muted transition hover:border-action-text hover:text-action-text"
        >
          ↺
        </button>
      ) : null}
    </div>
  );
}

export function DraftBanStrip({
  side,
  view,
  imageSize,
  currentStepIndex,
  resolve = defaultResolve,
  requestChangeFor,
}: {
  side: DraftSide;
  view: DraftMatchupSideView;
  imageSize: MatchDraftImageSize;
  currentStepIndex?: number;
  resolve?: (name: string) => MatchDraftChampion | null;
  requestChangeFor?: (stepIndex: number) => (() => void) | null;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${side === "red" ? "justify-end" : ""}`}>
      <p className="w-full text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Bans</p>
      {view.bans.map((ban, index) => {
        const previous = view.bans[index - 1];
        const phaseBreak = Boolean(previous && previous.slot + ban.slot === 7);
        return (
        <div key={`${side}-ban-${ban.slot}`} className={phaseBreak ? "ml-2" : ""}>
          <BanTile
            side={side}
            ban={ban}
            active={ban.stepIndex === currentStepIndex}
            resolve={resolve}
            imageSize={imageSize}
            onRequestChange={ban.stepIndex !== null ? requestChangeFor?.(ban.stepIndex) ?? null : null}
          />
        </div>
        );
      })}
    </div>
  );
}

export function DraftMatchupSidePanel({
  side,
  view,
  imageSize,
  currentStepIndex,
  resolve = defaultResolve,
  intentFor,
  requestChangeFor,
  online,
  slotClassName,
  emptyLabel,
  pickProps,
  className = "",
}: {
  side: DraftSide;
  view: DraftMatchupSideView;
  imageSize: MatchDraftImageSize;
  currentStepIndex?: number;
  resolve?: (name: string) => MatchDraftChampion | null;
  intentFor?: (stepIndex: number) => string | null;
  requestChangeFor?: (stepIndex: number) => (() => void) | null;
  online?: boolean;
  slotClassName?: string | ((pick: DraftMatchupPickView) => string);
  emptyLabel?: string;
  pickProps?: (pick: DraftMatchupPickView) => Pick< DraftPickSlotProps, "interactive" | "role" | "ariaLabel" | "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onKeyDown">;
  className?: string;
}) {
  return (
    <aside className={`flex min-w-0 flex-col gap-3 ${className}`}>
      <DraftTeamHeader side={side} team={view.team} online={online} />
      <div className="grid gap-2">
        {view.picks.map((pick) => (
          <DraftPickSlot
            key={`${side}-pick-${pick.slot}`}
            side={side}
            pick={pick}
            active={pick.stepIndex === currentStepIndex}
            intent={pick.stepIndex === null ? null : intentFor?.(pick.stepIndex) ?? null}
            imageSize={imageSize}
            resolve={resolve}
            slotClassName={typeof slotClassName === "function" ? slotClassName(pick) : slotClassName}
            emptyLabel={emptyLabel}
            onRequestChange={pick.stepIndex !== null ? requestChangeFor?.(pick.stepIndex) ?? null : null}
            {...pickProps?.(pick)}
          />
        ))}
      </div>
      <DraftBanStrip side={side} view={view} imageSize={imageSize} currentStepIndex={currentStepIndex} resolve={resolve} requestChangeFor={requestChangeFor} />
    </aside>
  );
}

function DefaultRail({ view }: { view: DraftMatchupView }) {
  return (
    <div className="flex min-w-32 flex-col items-center justify-center rounded border border-border-subtle bg-surface px-4 py-4 text-center">
      <span className="label-dash">Game {view.gameNumber}</span>
      <span className="type-display mt-1 text-2xl text-white">
        {view.outcome.status === "winner" ? `${view.outcome.winnerTeam} win` : "Unresolved"}
      </span>
      {view.metadata.railNote ? <span className="mt-1 text-xs text-cyan">{view.metadata.railNote}</span> : null}
      {view.metadata.stageLabel ? <span className="mt-1 text-xs uppercase text-muted">{view.metadata.stageLabel}</span> : null}
    </div>
  );
}

export function DraftMatchupBoard({
  view,
  imageSize = "lg",
  layout = "matchup",
  resolve = defaultResolve,
  intentFor,
  requestChangeFor,
  online,
  renderRail,
  slotClassName,
  emptyLabel,
  pickProps,
  children,
  className = "",
}: {
  view: DraftMatchupView;
  imageSize?: MatchDraftImageSize;
  layout?: "matchup" | "columns";
  resolve?: (name: string) => MatchDraftChampion | null;
  intentFor?: (stepIndex: number) => string | null;
  requestChangeFor?: (stepIndex: number) => (() => void) | null;
  online?: Partial<Record<DraftSide, boolean | undefined>>;
  renderRail?: () => ReactNode;
  slotClassName?: string | ((pick: DraftMatchupPickView) => string);
  emptyLabel?: string;
  pickProps?: (pick: DraftMatchupPickView) => Pick< DraftPickSlotProps, "interactive" | "role" | "ariaLabel" | "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onKeyDown">;
  children?: ReactNode;
  className?: string;
}) {
  const rail = renderRail ? renderRail() : <DefaultRail view={view} />;
  const currentStepIndex = view.live?.currentStepIndex;
  const blue = <DraftMatchupSidePanel side="blue" view={view.blue} imageSize={imageSize} currentStepIndex={currentStepIndex} resolve={resolve} intentFor={intentFor} requestChangeFor={requestChangeFor} online={online?.blue} slotClassName={slotClassName} emptyLabel={emptyLabel} pickProps={pickProps} />;
  const red = <DraftMatchupSidePanel side="red" view={view.red} imageSize={imageSize} currentStepIndex={currentStepIndex} resolve={resolve} intentFor={intentFor} requestChangeFor={requestChangeFor} online={online?.red} slotClassName={slotClassName} emptyLabel={emptyLabel} pickProps={pickProps} />;

  if (layout === "columns") {
    return (
      <div className={`flex flex-col gap-4 ${className}`}>
        <div className="flex justify-center">{rail}</div>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-[18rem_minmax(0,1fr)_18rem]">
          <div className="order-1 min-w-0">{blue}</div>
          <div className="order-3 col-span-2 min-w-0 xl:order-2 xl:col-span-1">{children}</div>
          <div className="order-2 min-w-0 xl:order-3">{red}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-start ${className}`}>
      <div className="order-2 min-w-0 lg:order-1">{blue}</div>
      <div className="order-1 flex justify-center lg:order-2">{rail}</div>
      <div className="order-3 min-w-0">{red}</div>
    </div>
  );
}

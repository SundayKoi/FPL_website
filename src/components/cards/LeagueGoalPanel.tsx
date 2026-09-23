// The league goal: one shared expedition a week that every collector's
// runs walk toward together (src/lib/expeditions/league.ts, spec §3).
//
// Self-contained and prop-driven, so the board can mount the panel as the
// drawer's League tab and put LeagueGoalLine in its This-week strip, both
// from the one `league` prop the page builds (fetchLeagueBoard). A null
// league — the league reads failed, or the migration is not applied —
// renders nothing, which is how the tab and the line stay hidden.
//
// Presentation only: a goal falls, and a fragment is paid, in
// fell_expedition_league_goal and nowhere else.

import { EXPEDITION_TIERS } from "@/lib/expeditions/config";
import {
  LEAGUE_GOAL_FRAGMENTS,
  easternWeekday,
  fellVerb,
  ordinal,
  progressLine,
  unitCount,
  unitVerb,
  type LeagueBoard,
  type LeagueWeek,
} from "@/lib/expeditions/league";

const FRAGMENT_WORDS = LEAGUE_GOAL_FRAGMENTS === 1 ? "one map fragment" : `${LEAGUE_GOAL_FRAGMENTS} map fragments`;

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Reached Thursday — a map fragment to each of the 12 who helped." */
function fellLine(week: LeagueWeek): string {
  const { goal, fell } = week;
  if (!fell) return "";
  const who = fell.rewarded > 0 ? `each of the ${fell.rewarded} who helped` : "everyone who helped";
  return `${capitalise(fellVerb(goal.kind))} ${easternWeekday(fell.at)} — ${FRAGMENT_WORDS} to ${who}.${fell.mine ? " Yours is already counted with your map fragments." : ""}`;
}

/** The viewer's part, in a sentence; null when nobody is signed in. */
function mineLine(week: LeagueWeek, current: boolean): string | null {
  const { goal, me, fell } = week;
  if (!me) return null;
  const verb = unitVerb(goal.unit);
  if (me.rank !== null) {
    const place = `${ordinal(me.rank)} of ${me.of} ${me.of === 1 ? "collector" : "collectors"}`;
    const late = fell && !fell.mine ? " They came in after it fell; the fragments went to those who got it there." : "";
    return `You: ${unitCount(me.stat, goal.unit)} ${verb} — ${place}.${late}`;
  }
  if (fell) return `It fell without you this time. ${current ? "Next week's goal starts Monday." : "This week's is still open."}`;
  return current
    ? "You haven't added to it yet. Any run you launch this week counts once the squad is home."
    : "Nothing of yours on this one: only runs that left last week count toward it.";
}

function WeekCard({ week, current }: { week: LeagueWeek; current: boolean }) {
  const { goal, progress, leaders, me, fell } = week;
  const when = current ? "this week" : "last week";
  const line = progressLine(week, when);
  const pct = Math.round(progress.fraction * 100);
  const mine = mineLine(week, current);
  return (
    <article
      data-testid={current ? "league-this-week" : "league-last-week"}
      className={`card-brand flex flex-col gap-3 p-4 sm:p-5 ${fell ? "border-mint/50" : "border-gold/40"}`}
    >
      <div className="flex flex-col gap-1">
        <span className="label-dash">
          {current ? "This week" : "Last week · still open"} · {goal.kind === "landmark" ? "a landmark to walk to" : "a boss to bring down"}
        </span>
        <h3 data-testid="league-goal-title" className="type-display text-xl text-white sm:text-2xl">
          {goal.title}
        </h3>
        {current ? <p className="text-xs text-steel">{goal.blurb}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <p data-testid="league-goal-progress" className="text-sm font-semibold text-white">
          {line}
        </p>
        <div
          className="bar-track"
          role="progressbar"
          aria-label={`${goal.title}: ${line}`}
          aria-valuemin={0}
          aria-valuemax={goal.target}
          aria-valuenow={Math.min(progress.total, goal.target)}
        >
          <div className="bar-fill" style={{ width: `${pct}%`, background: fell ? "var(--color-mint)" : "var(--color-gold)" }} />
        </div>
        {fell ? null : (
          <p data-testid="league-goal-remaining" className="text-xs text-steel">
            {unitCount(progress.remaining, goal.unit)} to go.{" "}
            {current
              ? `When it falls, ${FRAGMENT_WORDS} to everyone who helped.`
              : "Runs that left last week still count once they're home, until this Sunday ends (Eastern)."}
          </p>
        )}
      </div>

      {fell ? (
        <p data-testid="league-goal-fell" className="rounded-md border border-mint/40 bg-mint/10 px-3 py-2 text-sm text-mint">
          {fellLine(week)}
          {fell.vanguard ? (
            <>
              {" "}
              <span className="text-white">Vanguard: {fell.vanguard.username}</span> — did the most to get it there.
            </>
          ) : null}
        </p>
      ) : null}

      {mine ? (
        <p data-testid="league-goal-mine" className="text-sm text-white">
          {mine}
        </p>
      ) : null}

      {current ? (
        leaders.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <span className="label-dash">{goal.unit === "miles" ? "Who walked the most" : "Who pushed the most"}</span>
            <ol data-testid="league-goal-leaders" className="flex flex-col gap-1 text-xs tabular-nums">
              {leaders.map((row, index) => {
                const vanguard = fell?.vanguard?.discordId === row.discordId;
                const isMe = me?.rank === index + 1;
                return (
                  <li
                    key={row.discordId}
                    data-testid={`league-leader-${row.discordId}`}
                    className={`flex items-baseline justify-between gap-3 rounded-md px-2 py-1 ${isMe ? "bg-gold/10" : ""}`}
                  >
                    <span className="min-w-0 truncate">
                      <span className="mr-2 text-steel">{index + 1}.</span>
                      <span className="font-semibold text-white">{row.username}</span>
                      {isMe ? <span className="ml-1 text-steel">(you)</span> : null}
                      {vanguard ? (
                        <span className="ml-2 rounded-full border border-gold/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-gold">
                          Vanguard
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-steel">{unitCount(row.stat, goal.unit)}</span>
                  </li>
                );
              })}
            </ol>
            {fell ? null : <p className="text-xs text-steel">Whoever is out in front when it falls is named Vanguard for the week.</p>}
          </div>
        ) : (
          <p data-testid="league-goal-empty" className="text-xs text-steel">
            Nobody has brought a run home this week yet. The first squad home starts the count.
          </p>
        )
      ) : null}
    </article>
  );
}

export default function LeagueGoalPanel({ league }: { league: LeagueBoard | null }) {
  if (!league) return null;
  const { thisWeek, lastWeek } = league;
  const lastFell = lastWeek?.fell ?? null;
  return (
    <section aria-label="League goal" data-testid="league-goal" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="type-display text-2xl sm:text-3xl">League goal</h2>
        <p className="text-sm text-steel">
          One shared expedition a week for the whole league. Every run you bring home counts for the week it left in. When the
          league gets there, everyone who helped gets {FRAGMENT_WORDS} ({EXPEDITION_TIERS.legendary.fragments} open the Legendary
          route), and whoever did the most is named Vanguard.
        </p>
      </div>

      {lastFell && lastWeek ? (
        <p data-testid="league-last-fell" className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
          <span className="font-bold uppercase tracking-[0.14em] text-mint">Last week</span>
          <span className="text-white">
            {lastWeek.goal.title} — {fellVerb(lastWeek.goal.kind)} {easternWeekday(lastFell.at)}.
          </span>
          {lastFell.vanguard ? (
            <span data-testid="league-vanguard" className="rounded-full border border-gold/50 bg-gold/10 px-3 py-0.5">
              <span className="font-bold uppercase tracking-[0.12em] text-gold">Vanguard</span>{" "}
              <span className="text-white">{lastFell.vanguard.username}</span>
            </span>
          ) : null}
        </p>
      ) : null}

      <WeekCard week={thisWeek} current />
      {lastWeek && !lastFell ? <WeekCard week={lastWeek} current={false} /> : null}
    </section>
  );
}

/**
 * The league goal in one line, for the board's This-week strip. With
 * `onOpen` it is a button (a 44px target) that opens the League tab;
 * without, plain text. Null when the league goal is hidden.
 */
export function LeagueGoalLine({ league, onOpen }: { league: LeagueBoard | null; onOpen?: () => void }) {
  if (!league) return null;
  const week = league.thisWeek;
  const { goal, progress, fell } = week;
  const text = fell
    ? `${goal.title} ${fellVerb(goal.kind)} ${easternWeekday(fell.at)} — ${fell.mine ? `+${LEAGUE_GOAL_FRAGMENTS} map fragment${LEAGUE_GOAL_FRAGMENTS === 1 ? "" : "s"} for you` : "a map fragment to everyone who helped"}`
    : `${progress.total} of ${unitCount(goal.target, goal.unit)} ${unitVerb(goal.unit)} ${goal.kind === "landmark" ? "toward" : "on"} ${goal.title} by ${
        progress.collectors === 1 ? "1 collector" : `${progress.collectors} collectors`
      }`;
  const body = (
    <>
      <span className={`font-bold uppercase tracking-[0.14em] ${fell ? "text-mint" : "text-gold"}`}>League goal</span>{" "}
      <span className="text-white">{text}</span>
    </>
  );
  if (onOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        data-testid="league-line"
        className="inline-flex min-h-11 items-center text-left text-xs underline-offset-4 hover:underline"
      >
        <span>{body}</span>
      </button>
    );
  }
  return (
    <span data-testid="league-line" className="text-xs">
      {body}
    </span>
  );
}

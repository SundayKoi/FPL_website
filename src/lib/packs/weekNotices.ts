// What is going on in the pack shop this week, as one ordered list.
//
// The shop used to open on up to four full-width banners — Live Drops, the
// Champion's Tribute, the Faceless Drop, and This Week's Chase — each in its
// own colour system, stacked above the buy button. On a busy week that was
// four announcements before the thing the page exists for. This ranks them
// so one strip can lead with the one that matters most right now and fold
// the rest into chips. Pure, so the order is a test rather than a hope.

import type { ChaseBanner, LiveWindow } from "./queries";

export type WeekNoticeTone = "live" | "red" | "gold";

export interface WeekNotice {
  key: "live" | "tribute" | "faceless" | "chase";
  /** The short heading — "Live drops", "This week's chase". */
  title: string;
  /** The one line that says what it means for the reader. */
  text: string;
  /** Deadline, odds, who took it — smaller, after the text. */
  detail?: string;
  tone: WeekNoticeTone;
}

export interface WeekNoticeInput {
  liveWindow: LiveWindow | null;
  chase: ChaseBanner | null;
  /** The Faceless Drop's open vault, premier only. */
  championsWindow: { until: string } | null;
  /** Free Faceless Packs owed to an S4 champion. */
  championComps: number;
}

/** "9:30 PM ET" — the league's clock. */
function easternTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

/** "Sep 14" — the league's calendar. */
function easternDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
}

/**
 * Most urgent first: a live window is minutes long; a tribute is money the
 * reader is owed; the Faceless vault has a closing date; the chase stands
 * all week. An empty list means a quiet week, and the strip draws nothing.
 */
export function weekNotices({ liveWindow, chase, championsWindow, championComps }: WeekNoticeInput): WeekNotice[] {
  const notices: WeekNotice[] = [];
  if (liveWindow) {
    notices.push({
      key: "live",
      title: "Live drops",
      text: liveWindow.label,
      detail: `Foil odds boosted until ${easternTime(liveWindow.until)} ET · every card stamped LIVE`,
      tone: "live",
    });
  }
  if (championComps > 0) {
    notices.push({
      key: "tribute",
      title: "Champion's Tribute",
      text: `${championComps} free Faceless Pack${championComps === 1 ? "" : "s"} ${championComps === 1 ? "is" : "are"} yours for the S4 title.`,
      detail: championsWindow
        ? "The Faceless Pack button won't charge you until they're spent."
        : "They unlock the moment the vault opens.",
      tone: "red",
    });
  }
  if (championsWindow) {
    notices.push({
      key: "faceless",
      title: "The Faceless Drop",
      text: "Season Four's champions as The Hand — K, A, Q, 7 and the Joker, one per pack.",
      detail: `Vault shuts ${easternDay(championsWindow.until)} — then what was pulled is all there will ever be.`,
      tone: "red",
    });
  }
  if (chase) {
    notices.push({
      key: "chase",
      title: "This week's chase",
      text: chase.title,
      detail: chase.claimedBy
        ? `Taken by ${chase.claimedBy}`
        : `First to pull it${chase.bounty > 0 ? ` wins ${chase.bounty} betting dollars and` : ""} takes the CHASE stamp`,
      tone: "gold",
    });
  }
  return notices;
}

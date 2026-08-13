export const DRAFT_DAY_AT = "2026-08-15T20:00:00-05:00";
export const FIRST_GAME_AT = "2026-08-17T00:00:00-04:00";

export type HomepagePhase = "preseason" | "regular";

export function getHomepagePhase(now = new Date()): HomepagePhase {
  return now.getTime() >= new Date(FIRST_GAME_AT).getTime() ? "regular" : "preseason";
}

export function getCountdownParts(target: Date, now = new Date()) {
  const difference = Math.max(0, target.getTime() - now.getTime());
  const totalSeconds = Math.floor(difference / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    days,
    hours,
    minutes,
    seconds,
    complete: difference === 0,
  };
}

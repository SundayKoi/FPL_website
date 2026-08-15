const EASTERN_TIME_ZONE = "America/New_York";

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: EASTERN_TIME_ZONE,
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

const inputFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: EASTERN_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function partsFor(date: Date) {
  return Object.fromEntries(
    inputFormatter.formatToParts(date)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value])
  ) as Record<string, string>;
}

function easternOffsetMs(date: Date) {
  const parts = partsFor(date);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    0
  );
  return asUtc - date.getTime();
}

export function formatEasternDateTime(value: string | null) {
  if (!value) return "Not scheduled";
  return dateTimeFormatter.format(new Date(value));
}

export function formatEasternInputValue(value: string | null) {
  if (!value) return "";
  const parts = partsFor(new Date(value));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function parseEasternInputValue(value: string): { iso: string } | { error: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return { error: "Enter a date and time." };

  const [, year, month, day, hour, minute] = match;
  const wallClockMs = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0
  );
  let instantMs = wallClockMs;
  for (let index = 0; index < 2; index += 1) {
    instantMs = wallClockMs - easternOffsetMs(new Date(instantMs));
  }

  const parsed = new Date(instantMs);
  const parsedParts = partsFor(parsed);
  if (
    parsedParts.year !== year ||
    parsedParts.month !== month ||
    parsedParts.day !== day ||
    parsedParts.hour !== hour ||
    parsedParts.minute !== minute
  ) {
    return { error: "Enter a valid Eastern Time date and time." };
  }

  return { iso: parsed.toISOString() };
}

export function getScheduleState(
  startsAt: string | null,
  now: Date
): "unscheduled" | "upcoming" | "started" {
  if (!startsAt) return "unscheduled";
  return new Date(startsAt).getTime() > now.getTime() ? "upcoming" : "started";
}

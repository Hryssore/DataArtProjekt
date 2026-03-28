export function getTimeZoneParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const values = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value]),
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = getTimeZoneParts(date, timeZone);
  const interpretedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return interpretedAsUtc - date.getTime();
}

function createDateInTimeZone(parts, timeZone) {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  );
  const offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offset);
}

function shiftCalendarDay(parts, dayDelta) {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + dayDelta, 12, 0, 0));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function getDailyRefreshWindow(refreshHour, timeZone, now = new Date()) {
  const localNow = getTimeZoneParts(now, timeZone);
  const todayRefreshAt = createDateInTimeZone(
    {
      year: localNow.year,
      month: localNow.month,
      day: localNow.day,
      hour: refreshHour,
      minute: 0,
      second: 0,
    },
    timeZone,
  );

  if (now >= todayRefreshAt) {
    const nextDay = shiftCalendarDay(localNow, 1);
    const refreshAt = createDateInTimeZone(
      {
        ...nextDay,
        hour: refreshHour,
        minute: 0,
        second: 0,
      },
      timeZone,
    );

    return {
      startedAt: todayRefreshAt,
      refreshAt,
      cycleKey: `${localNow.year}-${String(localNow.month).padStart(2, "0")}-${String(localNow.day).padStart(2, "0")}-${refreshHour}`,
    };
  }

  const previousDay = shiftCalendarDay(localNow, -1);
  const startedAt = createDateInTimeZone(
    {
      ...previousDay,
      hour: refreshHour,
      minute: 0,
      second: 0,
    },
    timeZone,
  );

  return {
    startedAt,
    refreshAt: todayRefreshAt,
    cycleKey: `${previousDay.year}-${String(previousDay.month).padStart(2, "0")}-${String(previousDay.day).padStart(2, "0")}-${refreshHour}`,
  };
}

export function formatRefreshCountdown(refreshAt, nowMs) {
  const remainingMs = Math.max(0, refreshAt - nowMs);
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

export function hashCycleKey(cycleKey) {
  let hash = 0;

  for (const character of cycleKey) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash;
}

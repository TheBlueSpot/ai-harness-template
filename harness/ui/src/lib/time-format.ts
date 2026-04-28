const shortStampFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "2-digit",
  hour: "numeric",
  minute: "2-digit",
  hour12: true
});

export function formatShortTimestamp(value: Date | number | string | undefined | null) {
  if (value === undefined || value === null || value === "") {
    return "n/a";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "n/a";
  }

  const parts = Object.fromEntries(shortStampFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.month} ${parts.day} '${parts.year} - ${parts.hour}:${parts.minute} ${parts.dayPeriod}`;
}

export function resolveBrowserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

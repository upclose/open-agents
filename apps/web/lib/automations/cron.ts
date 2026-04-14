const CRON_FIELD_COUNT = 5;
const SEARCH_LIMIT_MINUTES = 366 * 24 * 60;

type CronFieldSpec = {
  min: number;
  max: number;
  aliases?: Record<string, number>;
};

type ParsedCron = {
  raw: string;
  minute: Set<number>;
  hour: Set<number>;
  dayOfMonth: Set<number>;
  month: Set<number>;
  dayOfWeek: Set<number>;
};

const MONTH_ALIASES: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const DAY_ALIASES: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function parseFieldValue(
  value: string,
  spec: CronFieldSpec,
  fieldName: string,
): number {
  const normalized = value.trim().toLowerCase();
  const aliasValue = spec.aliases?.[normalized];
  const parsedValue =
    aliasValue !== undefined ? aliasValue : Number.parseInt(normalized, 10);

  if (!Number.isInteger(parsedValue)) {
    throw new Error(`Invalid ${fieldName} value "${value}"`);
  }

  const normalizedValue =
    fieldName === "day-of-week" && parsedValue === 7 ? 0 : parsedValue;

  if (normalizedValue < spec.min || normalizedValue > spec.max) {
    throw new Error(`Invalid ${fieldName} value "${value}"`);
  }

  return normalizedValue;
}

function expandField(
  field: string,
  spec: CronFieldSpec,
  fieldName: string,
): Set<number> {
  const results = new Set<number>();
  const segments = field.split(",");

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) {
      throw new Error(`Invalid ${fieldName} segment`);
    }

    const [base, stepText] = trimmed.split("/");
    const step = stepText ? Number.parseInt(stepText, 10) : 1;
    if (!Number.isInteger(step) || step <= 0) {
      throw new Error(`Invalid ${fieldName} step "${trimmed}"`);
    }

    if (base === "*") {
      for (let value = spec.min; value <= spec.max; value += step) {
        results.add(value);
      }
      continue;
    }

    if (base.includes("-")) {
      const [startText, endText] = base.split("-");
      const start = parseFieldValue(startText ?? "", spec, fieldName);
      const end = parseFieldValue(endText ?? "", spec, fieldName);

      if (end < start) {
        throw new Error(`Invalid ${fieldName} range "${trimmed}"`);
      }

      for (let value = start; value <= end; value += step) {
        results.add(value);
      }
      continue;
    }

    const singleValue = parseFieldValue(base, spec, fieldName);
    results.add(singleValue);
  }

  return results;
}

function getZonedParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    weekday: "short",
  });

  const parts = formatter.formatToParts(date);
  const partValue = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const weekdayLabel = partValue("weekday").toLowerCase().slice(0, 3);

  return {
    month: Number.parseInt(partValue("month"), 10),
    day: Number.parseInt(partValue("day"), 10),
    hour: Number.parseInt(partValue("hour"), 10),
    minute: Number.parseInt(partValue("minute"), 10),
    dayOfWeek: DAY_ALIASES[weekdayLabel] ?? 0,
  };
}

function matchesCron(parsed: ParsedCron, candidate: Date, timezone: string) {
  const zoned = getZonedParts(candidate, timezone);

  return (
    parsed.minute.has(zoned.minute) &&
    parsed.hour.has(zoned.hour) &&
    parsed.dayOfMonth.has(zoned.day) &&
    parsed.month.has(zoned.month) &&
    parsed.dayOfWeek.has(zoned.dayOfWeek)
  );
}

export function parseCronExpression(expression: string): ParsedCron {
  const normalized = expression.trim();
  const fields = normalized.split(/\s+/);
  if (fields.length !== CRON_FIELD_COUNT) {
    throw new Error("Cron expressions must use 5 fields");
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;

  return {
    raw: normalized,
    minute: expandField(minute ?? "", { min: 0, max: 59 }, "minute"),
    hour: expandField(hour ?? "", { min: 0, max: 23 }, "hour"),
    dayOfMonth: expandField(
      dayOfMonth ?? "",
      { min: 1, max: 31 },
      "day-of-month",
    ),
    month: expandField(
      month ?? "",
      { min: 1, max: 12, aliases: MONTH_ALIASES },
      "month",
    ),
    dayOfWeek: expandField(
      dayOfWeek ?? "",
      { min: 0, max: 6, aliases: DAY_ALIASES },
      "day-of-week",
    ),
  };
}

export function getNextCronOccurrence(params: {
  cron: string;
  timezone: string;
  after?: Date;
}): Date | null {
  const parsed = parseCronExpression(params.cron);
  const after = params.after ?? new Date();
  const cursor = new Date(after);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  for (
    let minuteOffset = 0;
    minuteOffset < SEARCH_LIMIT_MINUTES;
    minuteOffset += 1
  ) {
    if (matchesCron(parsed, cursor, params.timezone)) {
      return new Date(cursor);
    }

    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  return null;
}

function describeDaysOfWeek(values: number[]): string {
  const labels = values
    .sort((left, right) => left - right)
    .map(
      (value) =>
        ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][value] ?? `${value}`,
    );

  return labels.join(", ");
}

function describeTime(hour: number, minute: number) {
  const date = new Date(Date.UTC(2026, 0, 1, hour, minute));
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(date);
}

export function summarizeCronSchedule(params: {
  cron: string;
  timezone: string;
}): string {
  const parsed = parseCronExpression(params.cron);
  const minutes = [...parsed.minute];
  const hours = [...parsed.hour];
  const daysOfMonth = [...parsed.dayOfMonth];
  const months = [...parsed.month];
  const daysOfWeek = [...parsed.dayOfWeek];

  if (
    minutes.length === 1 &&
    hours.length === 1 &&
    daysOfMonth.length === 31 &&
    months.length === 12 &&
    daysOfWeek.length === 7
  ) {
    return `Daily at ${describeTime(hours[0] ?? 0, minutes[0] ?? 0)} (${params.timezone})`;
  }

  if (
    minutes.length === 1 &&
    hours.length === 1 &&
    daysOfMonth.length === 31 &&
    months.length === 12 &&
    daysOfWeek.length > 0 &&
    daysOfWeek.length < 7
  ) {
    return `Every ${describeDaysOfWeek(daysOfWeek)} at ${describeTime(
      hours[0] ?? 0,
      minutes[0] ?? 0,
    )} (${params.timezone})`;
  }

  return `Custom cron (${params.cron}) in ${params.timezone}`;
}

export function formatAutomationDateTime(
  date: Date | null | undefined,
  timezone: string,
): string {
  if (!date) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
